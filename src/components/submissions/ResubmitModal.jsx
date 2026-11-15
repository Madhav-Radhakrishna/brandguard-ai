// components/submissions/ResubmitModal.jsx
// Allows employee to review corrected text and submit version n+1 linked to parent.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Button from '../ui/Button'
import LoadingBar from '../ui/LoadingBar'

const MAX_CHARS = 5000

export default function ResubmitModal({ submission, findings, onClose }) {
  const navigate = useNavigate()

  // Pre-calculate suggested text by applying accepted / edited corrections
  const initialText = () => {
    let result = submission.text
    // Sort findings descending by length to avoid partial substring collisions
    const activeActions = findings
      .filter(f => (f.employee_action === 'accepted' || f.employee_action === 'edited') && f.original_text)
      .sort((a, b) => b.original_text.length - a.original_text.length)

    for (const f of activeActions) {
      const replacement = f.employee_action === 'edited'
        ? (f.final_correction || '')
        : (f.final_correction || f.suggestion || '')
      if (replacement && result.includes(f.original_text)) {
        result = result.replace(f.original_text, replacement)
      }
    }
    return result
  }

  const [text, setText] = useState(initialText)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const remaining = MAX_CHARS - text.length
  const overLimit = remaining < 0

  async function handleResubmit() {
    setError('')
    if (!text.trim()) { setError('Submission text cannot be empty.'); return }
    if (overLimit) { setError(`Text must be under ${MAX_CHARS} characters.`); return }

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
      if (!res.ok) {
        setError(json.error || 'Resubmission audit failed.')
        setLoading(false)
        return
      }

      onClose()
      navigate(`/submissions/${json.submissionId}`)
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Audit timed out. Please try again.')
      } else {
        setError(err.message || 'Network error.')
      }
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border w-full max-w-2xl flex flex-col max-h-[90vh]">
        {loading && <LoadingBar />}
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-fg">
              Resubmit as Version {(submission.version || 1) + 1}
            </h2>
            <p className="text-xs text-muted font-mono mt-0.5">
              Parent: v{submission.version || 1} ({submission.id.slice(0, 8)})
            </p>
          </div>
          <button onClick={onClose} disabled={loading} className="text-muted hover:text-fg text-xl leading-none">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          <p className="text-xs text-muted leading-relaxed">
            Accepted suggestions and edits have been applied below. You can make final adjustments
            before triggering a new audit.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono uppercase tracking-widest text-muted">
              Revised Text (Draft v{(submission.version || 1) + 1})
            </label>
            <textarea
              rows={10}
              value={text}
              onChange={e => { setText(e.target.value); setError('') }}
              disabled={loading}
              className={`
                w-full bg-[#0A0A0A] border text-fg text-sm px-4 py-3
                focus:outline-none focus:border-accent placeholder:text-muted
                resize-y leading-relaxed font-sans
                ${overLimit ? 'border-accent' : 'border-border'}
                ${loading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            />
          </div>

          <div className="flex justify-between items-center text-xs font-mono">
            <span className={overLimit ? 'text-accent' : 'text-muted'}>
              {remaining < 0 ? `${Math.abs(remaining)} chars over limit` : `${remaining} chars remaining`}
            </span>
            <span className="text-muted">{text.length} / {MAX_CHARS}</span>
          </div>

          {error && <p className="text-xs text-accent">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleResubmit} disabled={loading || overLimit || !text.trim()}>
            {loading ? 'Auditing v' + ((submission.version || 1) + 1) + '…' : `Submit Version ${(submission.version || 1) + 1}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
