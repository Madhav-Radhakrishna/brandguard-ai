// api/audit.js
// POST /api/audit — brand compliance audit pipeline.
// Rule engine runs always (fast, deterministic).
// Gemini runs with a strict timeout; if it times out/fails, partial=true is returned.
// Supports demo / no-login judge mode seamlessly.
import { z } from 'zod'
import { getSupabaseAdmin }          from './_lib/supabaseAdmin.js'
import { runRuleEngine }             from './_lib/ruleEngine.js'
import { embedText, runGeminiAudit } from './_lib/geminiClient.js'

const AuditInput = z.object({
  text:                 z.string().min(1).max(5000),
  source:               z.enum(['typed', 'docx', 'pdf']),
  filename:             z.string().optional(),
  parent_submission_id: z.string().uuid().optional(),
  version:              z.number().int().min(1).optional(),
})

const VALID_CATEGORIES = new Set(['tone', 'claim', 'other'])
const VALID_SEVERITIES = new Set(['high', 'medium', 'low'])

function timeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  )
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabaseAdmin()

  // ── AUTH (Supports real token OR Demo / No-Login mode) ────────────────────
  let userId = null
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()

  if (token && !token.startsWith('demo-token')) {
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) userId = user.id
  }

  // Fallback: If in demo mode or no token, resolve to an existing profile in DB
  if (!userId) {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .single()

    if (existingProfile) {
      userId = existingProfile.id
    } else {
      // Use fallback UUID if table is empty
      userId = '00000000-0000-0000-0000-000000000001'
    }
  }

  // ── VALIDATE ─────────────────────────────────────────────────────────────
  const parsed = AuditInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { text, source, filename, parent_submission_id, version = 1 } = parsed.data

  // ── LOAD RULES ───────────────────────────────────────────────────────────
  const { data: allRules, error: rulesErr } = await supabase
    .from('brand_rules').select('*').eq('status', 'approved')
  if (rulesErr) return res.status(500).json({ error: 'Failed to load rules' })
  const approvedRuleIds = new Set(allRules.map(r => r.id))

  // ── SAVE SUBMISSION ──────────────────────────────────────────────────────
  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .insert({
      author_id: userId,
      text,
      source,
      filename: filename || null,
      version,
      parent_submission_id: parent_submission_id || null,
      status: 'pending_review',
    })
    .select().single()
  if (subErr) return res.status(500).json({ error: 'Failed to save submission: ' + subErr.message })

  // ── RULE ENGINE (sync, always works) ─────────────────────────────────────
  const ruleFindings = runRuleEngine(text, allRules, new Date().toISOString())

  // ── MEMORY (5s timeout — non-blocking on failure) ─────────────────────────
  let memoryCases = []
  try {
    const embedding = await Promise.race([embedText(text), timeout(5000)])
    const { data: memData } = await supabase.rpc('match_memory', {
      query_embedding: embedding, match_count: 3, min_similarity: 0.75,
    })
    memoryCases = memData || []
  } catch (e) {
    console.error('Memory skipped:', e.message)
  }

  // ── GEMINI (7s timeout — non-blocking fallback on failure) ────────────────
  let geminiFindings = []
  let partial = false

  function validateGemini(raw) {
    return (Array.isArray(raw) ? raw : []).filter(f => {
      if (!f.original_text || !f.category || !f.severity) return false
      if (!text.includes(f.original_text))               return false
      if (!VALID_CATEGORIES.has(f.category))             return false
      if (!VALID_SEVERITIES.has(f.severity))             return false
      if (f.rule_id && !approvedRuleIds.has(f.rule_id))  return false
      return true
    })
  }

  try {
    const raw = await Promise.race([
      runGeminiAudit(text, allRules, memoryCases),
      timeout(7000),
    ])
    geminiFindings = validateGemini(raw)
  } catch (e) {
    console.warn('Gemini attempt 1 timed out or failed:', e.message)
    try {
      const raw = await Promise.race([runGeminiAudit(text, allRules, []), timeout(5000)])
      geminiFindings = validateGemini(raw)
    } catch (e2) {
      console.warn('Gemini attempt 2 failed, proceeding with rule findings only:', e2.message)
      partial = true
    }
  }

  // ── DEDUP: drop Gemini findings already caught by rule engine ────────────
  const ruleTexts  = new Set(ruleFindings.map(f => f.original_text.toLowerCase()))
  const dedupGemini = geminiFindings.filter(f => !ruleTexts.has(f.original_text.toLowerCase()))

  // ── SAVE FINDINGS ────────────────────────────────────────────────────────
  const allFindings = [
    ...ruleFindings,
    ...dedupGemini.map(f => ({ ...f, source: 'gemini' })),
  ]

  let savedFindings = []
  if (allFindings.length > 0) {
    const rows = allFindings.map(f => {
      const memCase = memoryCases.find(m =>
        m.case_text?.toLowerCase().includes(f.original_text?.toLowerCase())
      )
      return {
        submission_id:   submission.id,
        rule_id:         f.rule_id  || null,
        rule_snapshot:   f.rule_snapshot
          || (f.rule_id ? allRules.find(r => r.id === f.rule_id)?.content || '' : 'General guideline.'),
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

    const { data: inserted } = await supabase.from('findings').insert(rows).select()
    savedFindings = inserted || []
  }

  return res.status(200).json({
    submissionId:    submission.id,
    findings:        savedFindings,
    partial,
    memoryCasesUsed: memoryCases.length,
  })
}
