// api/assistant.js
// POST /api/assistant
// Brand Assistant: answers brand-rule questions using approved rules as grounding context.
// Includes graceful fallback if Gemini returns 403/429/quota error.
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

// Offline fallback helper when Gemini is quota-exhausted or billing-restricted
function generateRuleBasedAnswer(question, rules) {
  const qLower = question.toLowerCase()
  const matchedRules = []

  for (const r of rules) {
    const titleMatch = r.title && qLower.includes(r.title.toLowerCase())
    const keyMatch = r.rule_key && qLower.includes(r.rule_key.toLowerCase().replace(/_/g, ' '))
    const keywords = Array.isArray(r.keywords) ? r.keywords : []
    const kwMatch = keywords.some(kw => qLower.includes(kw.toLowerCase()))
    const contentMatch = r.content && r.content.toLowerCase().split(' ').some(w => w.length > 4 && qLower.includes(w))

    if (titleMatch || keyMatch || kwMatch || (kwMatch && contentMatch)) {
      matchedRules.push(r)
    }
  }

  // Common inquiries
  if (qLower.includes('cheap') || qLower.includes('cheapest')) {
    const rule = rules.find(r => (r.keywords || []).some(k => k.toLowerCase().includes('cheap')) || r.title.toLowerCase().includes('cheap'))
    return `**Policy on "Cheapest":**\nUnder LearnBridge brand guidelines, superlative or low-cost terms like *"cheapest"* or *"cheap"* are strictly prohibited.\n\n` +
      (rule ? `• **Rule:** ${rule.title} (${rule.rule_key})\n• **Guidance:** ${rule.content}\n• **Approved Alternative:** Use phrases like *"accessible learning"* or *"affordable high-quality education"* instead.` : `Please focus on value and quality rather than rock-bottom pricing.`)
  }

  if (qLower.includes('price') || qLower.includes('cost') || qLower.includes('plan') || qLower.includes('fee') || qLower.includes('₹') || qLower.includes('inr')) {
    const priceRules = rules.filter(r => r.type === 'fact' || r.value)
    if (priceRules.length > 0) {
      const items = priceRules.map(r => `• **${r.title}**: ${r.value || r.content}`).join('\n')
      return `Here are the approved pricing details from our brand guidelines:\n\n${items}\n\nAny other numeric pricing or unverified discount claims must be approved by Brand Management.`
    }
  }

  if (qLower.includes('caps') || qLower.includes('capital') || qLower.includes('shout') || qLower.includes('uppercase')) {
    return `**Policy on ALL CAPS:**\nUsing ALL CAPS for emphasis is discouraged across all official LearnBridge content. It comes across as aggressive or hype-driven.\n\nUse bolding or clear sentence structure for emphasis instead.`
  }

  if (qLower.includes('tone') || qLower.includes('voice') || qLower.includes('style')) {
    return `**LearnBridge Brand Voice & Tone:**\n• **Professional yet approachable**: Informative, empowering, and respectful.\n• **No exaggerated claims**: Avoid superlatives like "the #1 platform" or "#1 best".\n• **Clarity over hype**: Communicate learning outcomes clearly without gimmicky marketing.`
  }

  if (matchedRules.length > 0) {
    const details = matchedRules.slice(0, 3).map(r =>
      `• **${r.title}** (${r.type.toUpperCase()})\n  ${r.content}` + (r.value ? `\n  *Approved value:* ${r.value}` : '')
    ).join('\n\n')
    return `Here is what the brand guidelines state regarding your question:\n\n${details}`
  }

  // Generic helpful summary of available guidelines
  const topRules = rules.slice(0, 4).map(r => `• **${r.title}**: ${r.content}`).join('\n')
  return `I found the following active brand guidelines for LearnBridge:\n\n${topRules}\n\nFeel free to ask specifically about banned terms, pricing plans, or tone requirements!`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabaseAdmin()

  // ── AUTH (Supports real token OR Demo mode) ───────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (token && !token.startsWith('demo-token')) {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return res.status(401).json({ error: 'Unauthorised' })
  }

  // ── VALIDATE INPUT ────────────────────────────────────────────────────────
  const parsed = Input.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { question, history } = parsed.data

  // ── LOAD APPROVED RULES ───────────────────────────────────────────────────
  const { data: rules } = await supabase
    .from('brand_rules')
    .select('id, title, type, rule_key, content, value, keywords')
    .eq('status', 'approved')
    .order('type')

  const safeRules = rules || []

  const rulesBlock = safeRules.length > 0
    ? safeRules.map(r =>
        `• [${(r.type || 'rule').toUpperCase()}] ${r.title} (key: ${r.rule_key})\n` +
        `  Policy: ${r.content}` +
        (r.value ? `\n  Approved value: ${r.value}` : '')
      ).join('\n\n')
    : 'No approved rules are currently on file.'

  // ── GEMINI CONFIG ─────────────────────────────────────────────────────────
  const rawModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
  const model    = rawModel.replace(/^models\//, '')
  const apiKey   = process.env.GEMINI_API_KEY
  const url      = `${BASE}/models/${model}:generateContent?key=${apiKey}`

  const systemInstruction = {
    parts: [{
      text:
        `You are the Brand Assistant for LearnBridge, an online-learning company.\n` +
        `Your ONLY job is to answer questions about LearnBridge brand guidelines.\n\n` +
        `APPROVED BRAND RULES:\n` +
        rulesBlock +
        `\n\nINSTRUCTIONS:\n` +
        `- Answer concisely in plain language. Use bullet points for multiple items.\n` +
        `- Cite the relevant rule title when quoting policy.\n` +
        `- Never claim something is a rule unless it is in the list above.\n` +
        `- Keep responses under 300 words.`
    }]
  }

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
      timeout(15000),
    ])

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.warn(`Gemini returned status ${geminiRes.status}. Engaging rule-based fallback...`)
      // If 403 or 429 quota issue, gracefully return the rule-grounded response instead of throwing error!
      if (geminiRes.status === 403 || geminiRes.status === 429) {
        const fallbackAnswer = generateRuleBasedAnswer(question, safeRules)
        return res.status(200).json({ answer: fallbackAnswer, fallback: true })
      }
      return res.status(502).json({ error: `Gemini error ${geminiRes.status}: ${errText}` })
    }

    const data   = await geminiRes.json()
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!answer) {
      const fallbackAnswer = generateRuleBasedAnswer(question, safeRules)
      return res.status(200).json({ answer: fallbackAnswer, fallback: true })
    }

    return res.status(200).json({ answer })

  } catch (err) {
    console.warn('Gemini request failed, falling back to rule engine:', err.message)
    const fallbackAnswer = generateRuleBasedAnswer(question, safeRules)
    return res.status(200).json({ answer: fallbackAnswer, fallback: true })
  }
}
