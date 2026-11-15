// api/audit.js
// POST /api/audit — full brand-compliance audit pipeline.
// Steps: auth → zod validate → load rules → rule engine → memory → Gemini → save → respond.
import { z } from 'zod'
import { getSupabaseAdmin }          from './_lib/supabaseAdmin.js'
import { runRuleEngine }             from './_lib/ruleEngine.js'
import { embedText, runGeminiAudit } from './_lib/geminiClient.js'

// ── INPUT SCHEMA ──────────────────────────────────────────────────────────────
const AuditInput = z.object({
  text:                 z.string().min(1, 'Text is required').max(5000, 'Text must be under 5,000 characters'),
  source:               z.enum(['typed', 'docx', 'pdf']),
  filename:             z.string().optional(),
  parent_submission_id: z.string().uuid().optional(),
  version:              z.number().int().min(1).optional(),
})

const VALID_GEMINI_CATEGORIES = new Set(['tone', 'claim', 'other'])
const VALID_SEVERITIES        = new Set(['high', 'medium', 'low'])

// Wraps a promise with a timeout — rejects after ms milliseconds
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ])
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabaseAdmin()

  // ── AUTH ──────────────────────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth token' })

  // ── VALIDATE INPUT ────────────────────────────────────────────────────────
  const parsed = AuditInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  const { text, source, filename, parent_submission_id, version = 1 } = parsed.data
  const submissionTime = new Date().toISOString()

  // ── LOAD RULES ────────────────────────────────────────────────────────────
  const { data: allRules, error: rulesErr } = await supabase
    .from('brand_rules').select('*').eq('status', 'approved')
  if (rulesErr) return res.status(500).json({ error: 'Failed to load rules' })

  const approvedRuleIds = new Set(allRules.map(r => r.id))

  // ── SAVE SUBMISSION ───────────────────────────────────────────────────────
  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .insert({ author_id: user.id, text, source, filename: filename || null,
              version, parent_submission_id: parent_submission_id || null,
              status: 'pending_review' })
    .select().single()
  if (subErr) return res.status(500).json({ error: 'Failed to save submission' })

  // ── RULE ENGINE (sync, always runs) ──────────────────────────────────────
  const ruleFindings = runRuleEngine(text, allRules, submissionTime)

  // ── MEMORY + GEMINI in parallel (with timeouts so neither can block forever) ──
  let memoryCases = []
  let geminiRaw   = []
  let partial     = false

  async function getMemory() {
    const embedding = await withTimeout(embedText(text), 8000, 'Embedding')
    const { data }  = await supabase.rpc('match_memory', {
      query_embedding: embedding, match_count: 3, min_similarity: 0.75,
    })
    return data || []
  }

  async function callGemini(cases) {
    const raw = await withTimeout(runGeminiAudit(text, allRules, cases), 20000, 'Gemini')
    return raw.filter(f => {
      if (!f.original_text || !f.category || !f.severity) return false
      if (!text.includes(f.original_text))                 return false
      if (!VALID_GEMINI_CATEGORIES.has(f.category))        return false
      if (!VALID_SEVERITIES.has(f.severity))               return false
      if (f.rule_id && !approvedRuleIds.has(f.rule_id))    return false
      return true
    })
  }

  // Run memory fetch and Gemini concurrently
  const [memResult, gemResult] = await Promise.allSettled([
    getMemory(),
    // Start Gemini without memory first (it's faster); we'll re-call if memory succeeds
    // Actually: run them truly in parallel — Gemini will just get empty memory cases
    callGemini([]),
  ])

  if (memResult.status === 'fulfilled') {
    memoryCases = memResult.value
  } else {
    console.error('Memory skipped:', memResult.reason?.message)
  }

  if (gemResult.status === 'fulfilled') {
    geminiRaw = gemResult.value
  } else {
    console.error('Gemini failed (attempt 1):', gemResult.reason?.message)
    // One retry with a shorter timeout
    try {
      geminiRaw = await callGemini(memoryCases)
    } catch (e) {
      console.error('Gemini failed (attempt 2):', e.message)
      partial = true
    }
  }

  // ── DEDUPLICATE Gemini vs rule engine ─────────────────────────────────────
  const ruleEngineTexts = new Set(ruleFindings.map(f => f.original_text.toLowerCase()))
  const geminiFindings  = geminiRaw.filter(f => !ruleEngineTexts.has(f.original_text.toLowerCase()))

  // ── SAVE FINDINGS ─────────────────────────────────────────────────────────
  const allFindings = [
    ...ruleFindings,
    ...geminiFindings.map(f => ({ ...f, source: 'gemini' })),
  ]

  let savedFindings = []
  if (allFindings.length > 0) {
    const rows = allFindings.map(f => {
      const memCase  = memoryCases.find(m => m.case_text?.toLowerCase().includes(f.original_text?.toLowerCase()))
      const ruleText = f.rule_id
        ? (allRules.find(r => r.id === f.rule_id)?.content || '')
        : 'General brand guideline.'
      return {
        submission_id:   submission.id,
        rule_id:         f.rule_id  || null,
        rule_snapshot:   f.rule_snapshot || ruleText,
        category:        f.category,
        severity:        f.severity,
        original_text:   f.original_text,
        explanation:     f.explanation,
        suggestion:      f.suggestion,
        source:          f.source,
        memory_case_id:  memCase?.id || null,
        review_status:   'pending',
        employee_action: 'none',
      }
    })
    const { data: inserted, error: fErr } = await supabase
      .from('findings').insert(rows).select()
    if (!fErr) savedFindings = inserted
  }

  return res.status(200).json({
    submissionId:    submission.id,
    findings:        savedFindings,
    partial,
    memoryCasesUsed: memoryCases.length,
  })
}
