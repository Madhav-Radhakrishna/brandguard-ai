// api/assistant.js
// POST /api/assistant
// Brand Assistant: answers brand-rule questions using approved rules as grounding context.
// Auth: any authenticated user (employee or manager).
// Body: { question: string, history?: [{role:'user'|'model', text:string}] }
import { z } from 'zod'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

const Input = z.object({
  question: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    text: z.string(),
  })).max(20).optional().default([]),
})

function timeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  )
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabaseAdmin()

  // ── AUTH ──────────────────────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorised' })

  // ── VALIDATE INPUT ────────────────────────────────────────────────────────
  const parsed = Input.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { question, history } = parsed.data

  // ── LOAD APPROVED RULES ───────────────────────────────────────────────────
  const { data: rules } = await supabase
    .from('brand_rules')
    .select('id, title, type, rule_key, content, value, examples')
    .eq('status', 'approved')
    .order('type')

  const rulesBlock = (rules || []).length > 0
    ? (rules || []).map(r =>
        `• [${(r.type || 'rule').toUpperCase()}] ${r.title} (key: ${r.rule_key})\n` +
        `  Policy: ${r.content}` +
        (r.value    ? `\n  Approved value: ${r.value}` : '') +
        (r.examples ? `\n  Examples: ${r.examples}` : '')
      ).join('\n\n')
    : 'No approved rules are currently on file.'

  // ── GEMINI CONFIG ─────────────────────────────────────────────────────────
  const rawModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
  const model    = rawModel.replace(/^models\//, '')
  const apiKey   = process.env.GEMINI_API_KEY
  const url      = `${BASE}/models/${model}:generateContent?key=${apiKey}`

  // System instruction passed via the proper Gemini API field (not as a turn)
  const systemInstruction = {
    parts: [{
      text:
        `You are the Brand Assistant for LearnBridge, an online-learning company.\n` +
        `Your ONLY job is to answer questions about LearnBridge brand guidelines.\n\n` +
        `APPROVED BRAND RULES (the only binding policy – do not invent rules):\n` +
        rulesBlock +
        `\n\nINSTRUCTIONS:\n` +
        `- Answer concisely in plain language. Use bullet points for multiple items.\n` +
        `- Cite the relevant rule title when quoting policy.\n` +
        `- If the question is unrelated to brand compliance, politely say you can only help with brand guidelines.\n` +
        `- If the user asks for a rewrite or example, provide one following the rules above.\n` +
        `- Never claim something is a rule unless it is in the list above.\n` +
        `- Keep responses under 300 words unless a detailed rewrite is explicitly requested.`
    }]
  }

  // Build contents array: prior history + current question (NO fake system turns)
  const contents = [
    ...history.map(h => ({
      role:  h.role,
      parts: [{ text: h.text }],
    })),
    { role: 'user', parts: [{ text: question }] },
  ]

  try {
    const geminiRes = await Promise.race([
      fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: {
            temperature:     0.3,
            maxOutputTokens: 600,
          },
        }),
      }),
      timeout(25000),
    ])

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      return res.status(502).json({ error: `Gemini error ${geminiRes.status}: ${errText}` })
    }

    const data   = await geminiRes.json()
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!answer) {
      // Surface finish reason if available (e.g. SAFETY block)
      const finishReason = data.candidates?.[0]?.finishReason || 'UNKNOWN'
      return res.status(502).json({ error: `Assistant returned no content (reason: ${finishReason}). Please rephrase your question.` })
    }

    return res.status(200).json({ answer })

  } catch (err) {
    if (err.message.includes('Timed out')) {
      return res.status(504).json({ error: 'The assistant took too long. Please try again.' })
    }
    return res.status(500).json({ error: err.message })
  }
}
