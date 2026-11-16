// api/memory.js
// POST /api/memory — store confirmed finding as memory case.
// PATCH /api/memory — revoke an existing memory entry.
// Supports both real sessions and no-login / demo role toggle.
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

  // ── AUTH (Supports real token OR Demo Manager mode) ───────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  let userId = null

  if (token && !token.startsWith('demo-token')) {
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) {
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role === 'brand_manager') userId = user.id
    }
  }

  // Fallback for demo role switcher
  if (!userId) {
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .single()
    userId = managerProfile?.id || '00000000-0000-0000-0000-000000000002'
  }

  // ── REVOKE (PATCH by id) ──────────────────────────────────────────────────
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

  // ── CREATE (POST) ─────────────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const parsed = CreateInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { finding_id, rule_id, case_text, final_correction } = parsed.data

  let embedding = []
  try {
    embedding = await Promise.race([embedText(case_text), timeout(8000)])
  } catch (e) {
    console.warn('Embedding skipped or failed:', e.message)
    // Create zero vector fallback if embedding API unavailable
    embedding = new Array(768).fill(0.001)
  }

  const { data, error } = await supabase
    .from('feedback_memory')
    .insert({
      finding_id,
      rule_id:          rule_id || null,
      case_text,
      final_correction: final_correction || null,
      embedding,
      status:           'active',
      reviewed_by:      userId,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ memory: data })
}
