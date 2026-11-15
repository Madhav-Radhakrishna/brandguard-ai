// api/audit.js
// POST /api/audit — the full brand-compliance audit pipeline.
// Steps: auth check → zod validate → load rules → rule engine → memory →
//        Gemini (tone/claims) → validate Gemini output → save → respond.
import { z } from 'zod'
import { getSupabaseAdmin }                from './_lib/supabaseAdmin.js'
import { runRuleEngine }                   from './_lib/ruleEngine.js'
import { embedText, runGeminiAudit }       from './_lib/geminiClient.js'

// ── INPUT SCHEMA ──────────────────────────────────────────────────────────────
const AuditInput = z.object({
  text:     z.string().min(1, 'Text is required').max(5000, 'Text must be under 5,000 characters'),
  source:   z.enum(['typed', 'docx', 'pdf']),
  filename: z.string().optional(),
  parent_submission_id: z.string().uuid().optional(),
  version:  z.number().int().min(1).optional(),
})

const VALID_GEMINI_CATEGORIES = new Set(['tone', 'claim', 'other'])
const VALID_SEVERITIES        = new Set(['high', 'medium', 'low'])

export default async function handler(req, res) {
  // CORS headers for local dev (vercel dev handles this in prod)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabaseAdmin()

  // ── AUTH: verify Supabase JWT ─────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth token' })

  // ── VALIDATE INPUT ────────────────────────────────────────────────────────
  const parsed = AuditInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  const { text, source, filename, parent_submission_id, version = 1 } = parsed.data
  const submissionTime = new Date().toISOString()

  // ── A: LOAD CURRENT APPROVED RULES ───────────────────────────────────────
  const { data: allRules, error: rulesErr } = await supabase
    .from('brand_rules')
    .select('*')
    .eq('status', 'approved')
  if (rulesErr) return res.status(500).json({ error: 'Failed to load rules' })

  const approvedRuleIds = new Set(allRules.map(r => r.id))

  // ── SAVE SUBMISSION (before audit so we have an ID) ───────────────────────
  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .insert({
      author_id:            user.id,
      text,
      source,
      filename:             filename || null,
      version,
      parent_submission_id: parent_submission_id || null,
      status:               'pending_review',
    })
    .select()
    .single()
  if (subErr) return res.status(500).json({ error: 'Failed to save submission' })

  // ── B: RULE ENGINE (deterministic — always runs) ─────────────────────────
  const ruleFindings = runRuleEngine(text, allRules, submissionTime)

  // ── C: MEMORY — embed text, retrieve similar confirmed cases ──────────────
  let memoryCases = []
  try {
    const embedding = await embedText(text)
    const { data: memData } = await supabase.rpc('match_memory', {
      query_embedding: embedding,
      match_count:     3,
      min_similarity:  0.75,
    })
    memoryCases = memData || []
  } catch (e) {
    console.error('Memory retrieval skipped:', e.message)
    // Non-fatal: proceed without memory
  }

  // ── D: GEMINI — tone + unsupported claims only ────────────────────────────
  let geminiRaw  = []
  let partial    = false // true if Gemini failed completely

  async function callGemini() {
    const raw = await runGeminiAudit(text, allRules, memoryCases)

    // Validate each Gemini finding strictly:
    return raw.filter(f => {
      if (!f.original_text || !f.category || !f.severity)   return false
      if (!text.includes(f.original_text))                   return false // must exist verbatim
      if (!VALID_GEMINI_CATEGORIES.has(f.category))         return false
      if (!VALID_SEVERITIES.has(f.severity))                 return false
      if (f.rule_id && !approvedRuleIds.has(f.rule_id))     return false // hallucinated rule_id
      return true
    })
  }

  try {
    geminiRaw = await callGemini()
  } catch (e) {
    console.error('Gemini attempt 1 failed:', e.message)
    try {
      geminiRaw = await callGemini() // one retry
    } catch (e2) {
      console.error('Gemini attempt 2 failed:', e2.message)
      partial = true
    }
  }

  // ── E: DEDUPLICATE Gemini vs rule-engine overlaps ─────────────────────────
  const ruleEngineTexts = new Set(ruleFindings.map(f => f.original_text.toLowerCase()))
  const geminiFindings  = geminiRaw.filter(f =>
    !ruleEngineTexts.has(f.original_text.toLowerCase())
  )

  // ── F: BUILD FINDING ROWS and SAVE ───────────────────────────────────────
  const allFindings = [
    ...ruleFindings,
    ...geminiFindings.map(f => ({ ...f, source: 'gemini' })),
  ]

  let savedFindings = []
  if (allFindings.length > 0) {
    const rows = allFindings.map(f => {
      // Attach memory_case_id if a confirmed case is relevant to this finding
      const memCase = memoryCases.find(m =>
        m.case_text && f.original_text &&
        m.case_text.toLowerCase().includes(f.original_text.toLowerCase())
      )
      // rule_snapshot: copy of the rule text at this exact moment (immutable record)
      const ruleText = f.rule_id
        ? (allRules.find(r => r.id === f.rule_id)?.content || '')
        : 'General brand guideline — no specific rule cited.'

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
      .from('findings')
      .insert(rows)
      .select()
    if (!fErr) savedFindings = inserted
  }

  return res.status(200).json({
    submissionId:    submission.id,
    findings:        savedFindings,
    partial,          // true = Gemini failed; only rule-engine results returned
    memoryCasesUsed: memoryCases.length,
  })
}
