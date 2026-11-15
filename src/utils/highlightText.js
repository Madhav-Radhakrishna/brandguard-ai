// utils/highlightText.js
// Splits submission text into plain and highlighted segments.
// Used in the split-pane findings view to show flagged spans inline.
export function buildHighlightSegments(text, findings) {
  if (!findings || findings.length === 0) return [{ text, highlighted: false }]

  // Build all match positions
  const marks = []
  findings.forEach(finding => {
    if (!finding.original_text) return
    const needle   = finding.original_text
    const needleLo = needle.toLowerCase()
    const hayLo    = text.toLowerCase()
    let from = 0
    while (from < text.length) {
      const pos = hayLo.indexOf(needleLo, from)
      if (pos === -1) break
      marks.push({ start: pos, end: pos + needle.length, severity: finding.severity, id: finding.id })
      from = pos + 1
    }
  })

  if (marks.length === 0) return [{ text, highlighted: false }]

  // Sort by start; for ties, prefer longer match (more specific)
  marks.sort((a, b) => a.start - b.start || b.end - a.end)

  const segments = []
  let pos = 0
  for (const mark of marks) {
    if (mark.start < pos) continue // overlapping — skip
    if (mark.start > pos) segments.push({ text: text.slice(pos, mark.start), highlighted: false })
    segments.push({ text: text.slice(mark.start, mark.end), highlighted: true, severity: mark.severity, findingId: mark.id })
    pos = mark.end
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), highlighted: false })

  return segments
}

// Map severity → Tailwind highlight class (subtle bg tint)
export function severityHighlight(severity) {
  return {
    high:   'bg-red-900/40 text-red-200',
    medium: 'bg-orange-900/40 text-orange-200',
    low:    'bg-zinc-700/40 text-zinc-300',
  }[severity] || 'bg-zinc-700/40'
}

// Map severity → left-border class for finding rows
export function severityBar(severity) {
  return {
    high:   'border-l-[3px] border-accent',
    medium: 'border-l-[3px] border-orange-400',
    low:    'border-l-[3px] border-zinc-600',
  }[severity] || 'border-l-[3px] border-zinc-600'
}
