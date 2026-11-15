// api/_lib/ruleEngine.js
// Deterministic rule engine — zero AI.
// Checks banned terms, preferred terms, and fact/price correctness.
// Every finding is linked to a specific rule_id so it can be cited.

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// "Current rule" for a rule_key = latest APPROVED version whose
// effective_from is on or before the submission's created_at.
function getCurrentRules(allRules, submissionTime) {
  const byKey = {}
  const time = new Date(submissionTime)

  for (const rule of allRules) {
    if (rule.status !== 'approved') continue
    if (new Date(rule.effective_from) > time) continue

    const existing = byKey[rule.rule_key]
    if (!existing || new Date(rule.effective_from) > new Date(existing.effective_from)) {
      byKey[rule.rule_key] = rule
    }
  }
  return Object.values(byKey)
}

// Parse "₹1,199" or "₹999" to an integer for comparison
function parseCurrencyInt(str) {
  return parseInt(str.replace(/[^\d]/g, ''), 10)
}

export function runRuleEngine(text, allRules, submissionTime) {
  const currentRules = getCurrentRules(allRules, submissionTime)
  const findings = []
  const seen = new Set() // key = ruleId:matchedText — dedup within same rule

  for (const rule of currentRules) {

    // ── BANNED TERMS ──────────────────────────────────────────────────────
    if (rule.type === 'banned_term') {
      for (const keyword of (rule.keywords || [])) {
        const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi')
        for (const match of text.matchAll(regex)) {
          const key = `${rule.id}:${match[0].toLowerCase()}`
          if (seen.has(key)) continue
          seen.add(key)
          findings.push({
            rule_id:       rule.id,
            rule_snapshot: rule.content,
            category:      'terminology',
            severity:      'high',
            original_text: match[0],
            explanation:   `"${match[0]}" is a banned term under LearnBridge brand guidelines.`,
            suggestion:    rule.replacement
              ? `Replace with "${rule.replacement}".`
              : 'Remove or rephrase this term.',
            source: 'rule_engine',
          })
        }
      }
    }

    // ── PREFERRED TERMS ───────────────────────────────────────────────────
    if (rule.type === 'preferred_term') {
      for (const keyword of (rule.keywords || [])) {
        const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi')
        for (const match of text.matchAll(regex)) {
          const key = `${rule.id}:${match[0].toLowerCase()}`
          if (seen.has(key)) continue
          seen.add(key)
          findings.push({
            rule_id:       rule.id,
            rule_snapshot: rule.content,
            category:      'terminology',
            severity:      'low',
            original_text: match[0],
            explanation:   `"${match[0]}" is not banned but "${rule.replacement || 'the preferred term'}" is preferred.`,
            suggestion:    rule.replacement
              ? `Consider replacing with "${rule.replacement}".`
              : 'Use the preferred alternative.',
            source: 'rule_engine',
          })
        }
      }
    }

    // ── FACT / PRICE CHECK ────────────────────────────────────────────────
    // Triggers when a rule keyword appears AND a currency amount in the text
    // differs from the rule's approved value.
    if (rule.type === 'fact' && rule.value) {
      const keywordFound = (rule.keywords || []).some(kw =>
        new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(text)
      )
      if (keywordFound) {
        const approvedInt = parseCurrencyInt(rule.value)
        for (const match of text.matchAll(/₹[\d,]+(?:\.\d+)?/g)) {
          const textInt = parseCurrencyInt(match[0])
          if (textInt !== approvedInt) {
            const key = `${rule.id}:${match[0]}`
            if (seen.has(key)) continue
            seen.add(key)
            findings.push({
              rule_id:       rule.id,
              rule_snapshot: rule.content,
              category:      'fact',
              severity:      'high',
              original_text: match[0],
              explanation:   `Incorrect price. Approved value is ${rule.value}; text states ${match[0]}.`,
              suggestion:    `Change to the approved price: ${rule.value}.`,
              source:        'rule_engine',
            })
          }
        }
      }
    }
  }

  return findings
}
