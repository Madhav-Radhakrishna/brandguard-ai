// api/memory.js
// POST /api/memory — called by manager UI to store a confirmed finding as a memory case.
// Embeds case_text with Gemini embeddings and stores in feedback_memory.
// Also handles PATCH to revoke an existing memory entry.
import { z } from 'zod'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { embedText }        from './_lib/geminiClient.js'

const CreateInput = z.object({
  finding_id:       z.string().uuid(),
  rule_id:          z.string().uuid().nullable().optional(),
  case_text:        z.string().min(1),
  final_correction: z.string().nullable().optional(),
})

function timeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out ${ms}ms`)), ms)
  )
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabase = getSupabaseAdmin()

  // ── AUTH (manager only) ───────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorised' })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'brand_manager')
    return res.status(403).json({ error: 'Manager only' })

  // ── REVOKE (DELETE by id) ─────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { memory_id } = req.body
    if (!memory_id) return res.status(400).json({ error: 'memory_id required' })
    const { error } = await supabase
      .from('feedback_memory')
      .update({ status: 'revoked' })
      .eq('id', memory_id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── CREATE (POST) — embed and store confirmed case ────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const parsed = CreateInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { finding_id, rule_id, case_text, final_correction } = parsed.data

  // Embed the case text for future similarity retrieval
  let embedding
  try {
    embedding = await Promise.race([embedText(case_text), timeout(8000)])
  } catch (e) {
    return res.status(500).json({ error: 'Embedding failed: ' + e.message })
  }

  const { data, error } = await supabase
    .from('feedback_memory')
    .insert({
      finding_id,
      rule_id:         rule_id || null,
      case_text,
      final_correction: final_correction || null,
      embedding,
      status:          'active',
      reviewed_by:     user.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ memory: data })
}
