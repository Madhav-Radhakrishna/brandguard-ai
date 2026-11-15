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
  history:  z.array(z.object({
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

  // ── AUTH ─────────────────────────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorised' })

  // ── VALIDATE INPUT ───────────────────────────────────────────────────────────
  const parsed = Input.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { question, history } = parsed.data

  // ── LOAD APPROVED RULES ──────────────────────────────────────────────────────
  const { data: rules } = await supabase
    .from('brand_rules')
    .select('id, title, type, rule_key, content, value, examples')
    .eq('status', 'approved')
    .order('type')

  const rulesBlock = (rules || []).map(r =>
    `• [${r.type?.toUpperCase()}] ${r.title} (key: ${r.rule_key})` +
    `\n  Policy: ${r.content}` +
    (r.value        ? `\n  Approved value: ${r.value}` : '') +
    (r.examples     ? `\n  Examples: ${r.examples}` : '')
  ).join('\n\n')

  // ── BUILD GEMINI MULTI-TURN PROMPT ───────────────────────────────────────────
  const rawModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
  const model    = rawModel.replace(/^models\//, '')
  const apiKey   = process.env.GEMINI_API_KEY
  const url      = `${BASE}/models/${model}:generateContent?key=${apiKey}`

  const systemText = `You are the Brand Assistant for LearnBridge, an online-learning company.
Your ONLY job is to answer questions about LearnBridge's brand guidelines and communication policies.

APPROVED BRAND RULES (the only binding policy – do not invent rules):
${rulesBlock || 'No approved rules found.'}

INSTRUCTIONS:
- Answer concisely and in plain language. Use bullet points when listing multiple items.
- Quote the relevant rule title when you cite a rule.
- If the question is unrelated to brand compliance (e.g., coding, general knowledge), politely redirect: explain you can only help with brand guidelines.
- If the user asks for a specific example or rewrite, provide one that follows the rules above.
- Never claim something is a rule unless it appears in the list above.
- Keep responses under 300 words unless a detailed rewrite is explicitly requested.`

  // Build contents array: system + history + current question
  const contents = [
    { role: 'user',  parts: [{ text: systemText }] },
    { role: 'model', parts: [{ text: 'Understood. I am the Brand Assistant for LearnBridge. I will answer questions about brand guidelines using only the approved rules above. How can I help you?' }] },
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
          contents,
          generationConfig: {
            temperature:     0.3,
            maxOutputTokens: 600,
          },
        }),
      }),
      timeout(15000),
    ])

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      return res.status(502).json({ error: `Gemini error ${geminiRes.status}: ${errText}` })
    }

    const data   = await geminiRes.json()
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!answer) return res.status(502).json({ error: 'Gemini returned an empty response.' })

    return res.status(200).json({ answer })

  } catch (err) {
    if (err.message.includes('Timed out')) {
      return res.status(504).json({ error: 'The assistant took too long to respond. Please try again.' })
    }
    return res.status(500).json({ error: err.message })
  }
}
