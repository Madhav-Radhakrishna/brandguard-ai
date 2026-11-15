// components/submissions/ResubmitModal.jsx
// Pre-applies employee's accepted/edited corrections into draft text for version n+1.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Button from '../ui/Button'
import LoadingBar from '../ui/LoadingBar'

const MAX_CHARS = 5000

function applyCorrections(originalText, findings) {
  let result = originalText
  // Sort longest original_text first to avoid partial substring conflicts
  const toApply = findings
    .filter(f => f.employee_action === 'accepted' || f.employee_action === 'edited')
    .sort((a, b) => (b.original_text?.length || 0) - (a.original_text?.length || 0))

  for (const f of toApply) {
    if (!f.original_text || !result.includes(f.original_text)) continue
    // For accepted: use the replacement word stored in final_correction
    // (which is brand_rules.replacement, e.g. "affordable learning")
    // For edited: use the employee's custom text
    // If no replacement available, just remove the banned term
    const replacement = f.final_correction ?? ''
    result = result.replace(f.original_text, replacement)
  }
  return result
}

export default function ResubmitModal({ submission, findings, onClose }) {
  const navigate  = useNavigate()
  const [text, setText]       = useState(() => applyCorrections(submission.text, findings))
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const remaining = MAX_CHARS - text.length
  const overLimit = remaining < 0

  async function handleResubmit() {
    setError('')
    if (!text.trim()) { setError('Text cannot be empty.'); return }
    if (overLimit)    { setError('Text exceeds 5,000 characters.'); return }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 35000)

      const res = await fetch('/api/audit', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          text: text.trim(),
          source: submission.source || 'typed',
          parent_submission_id: submission.id,
          version: (submission.version || 1) + 1,
        }),
      })
      clearTimeout(timer)

      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Audit failed.'); setLoading(false); return }

      onClose()
      navigate(`/submissions/${json.submissionId}`)
    } catch (err) {
      setError(err.name === 'AbortError' ? 'Timed out. Please try again.' : (err.message || 'Network error.'))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border w-full max-w-2xl flex flex-col max-h-[90vh]">
        {loading && <LoadingBar />}

        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-fg">
              Resubmit as Version {(submission.version || 1) + 1}
            </h2>
            <p className="text-xs text-muted font-mono mt-0.5">
              Corrections applied. Review before submitting.
            </p>
          </div>
          <button onClick={onClose} disabled={loading} className="text-muted hover:text-fg text-xl leading-none">×</button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono uppercase tracking-widest text-muted">
              Revised Text — v{(submission.version || 1) + 1}
            </label>
            <textarea
              rows={10}
              value={text}
              onChange={e => { setText(e.target.value); setError('') }}
              disabled={loading}
              className={`w-full bg-bg border text-fg text-sm px-4 py-3 focus:outline-none focus:border-accent resize-y leading-relaxed ${overLimit ? 'border-accent' : 'border-border'} ${loading ? 'opacity-50' : ''}`}
            />
          </div>
          <div className="flex justify-between text-xs font-mono text-muted">
            <span className={overLimit ? 'text-accent' : ''}>{remaining < 0 ? `${Math.abs(remaining)} over limit` : `${remaining} remaining`}</span>
            <span>{text.length} / {MAX_CHARS}</span>
          </div>
          {error && <p className="text-xs text-accent">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleResubmit} disabled={loading || overLimit || !text.trim()}>
            {loading ? `Auditing v${(submission.version||1)+1}…` : `Submit v${(submission.version||1)+1}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
