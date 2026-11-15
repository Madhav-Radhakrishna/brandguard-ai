// pages/SubmitPage.jsx
// Employee types content (max 5,000 chars), clicks Audit, waits for result,
// then is redirected to the Submission Detail page.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppLayout from '../components/layout/AppLayout'
import PageHeader from '../components/layout/PageHeader'
import Button from '../components/ui/Button'
import LoadingBar from '../components/ui/LoadingBar'

const MAX_CHARS = 5000

export default function SubmitPage() {
  const navigate = useNavigate()
  const [text, setText]       = useState('')
  const [error, setError]     = useState('')
  const [auditing, setAuditing] = useState(false)

  const remaining = MAX_CHARS - text.length
  const overLimit = remaining < 0

  async function handleAudit() {
    setError('')
    if (!text.trim())    { setError('Please enter some content to audit.'); return }
    if (overLimit)       { setError(`Text must be under ${MAX_CHARS} characters.`); return }

    setAuditing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 35000) // 35s client timeout

      let res
      try {
        res = await fetch('/api/audit', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ text: text.trim(), source: 'typed' }),
        })
      } finally {
        clearTimeout(timer)
      }

      const json = await res.json()
      if (!res.ok) { setError(json.error || `Audit failed (${res.status}). Please try again.`); return }

      navigate(`/submissions/${json.submissionId}`)
    } catch (e) {
      if (e.name === 'AbortError') {
        setError('Audit timed out (>35s). The Gemini API may be slow — please try again.')
      } else {
        setError(`Error: ${e.message}`)
      }
    } finally {
      setAuditing(false)
    }
  }

  return (
    <AppLayout>
      {auditing && <LoadingBar />}
      <PageHeader title="Submit Content" />

      <div className="px-8 py-8 max-w-3xl">
        {/* Instructions */}
        <p className="text-muted text-sm mb-6">
          Paste or type your content below. The audit runs your text against LearnBridge brand
          rules and flags issues before publication. The original text is never overwritten.
        </p>

        {/* Textarea */}
        <div className="flex flex-col gap-1.5 mb-2">
          <label htmlFor="content" className="text-xs font-mono uppercase tracking-widest text-muted">
            Content
          </label>
          <textarea
            id="content"
            value={text}
            onChange={e => { setText(e.target.value); setError('') }}
            rows={14}
            placeholder="Type or paste your content here…"
            disabled={auditing}
            className={`
              w-full bg-surface border text-fg text-sm px-4 py-3
              focus:outline-none focus:border-accent placeholder:text-muted
              resize-y leading-relaxed
              ${overLimit ? 'border-accent' : 'border-border'}
              ${auditing  ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          />
        </div>

        {/* Character counter */}
        <div className="flex justify-between items-center mb-6">
          <span className={`text-xs font-mono ${overLimit ? 'text-accent' : 'text-muted'}`}>
            {remaining < 0
              ? `${Math.abs(remaining)} characters over limit`
              : `${remaining.toLocaleString()} characters remaining`}
          </span>
          <span className="text-xs text-muted font-mono">{text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</span>
        </div>

        {/* Error */}
        {error && <p className="text-sm text-accent mb-4">{error}</p>}

        {/* Auditing indicator */}
        {auditing && (
          <p className="text-sm text-muted mb-4 font-mono uppercase tracking-widest">
            Auditing…
          </p>
        )}

        {/* Submit */}
        <Button
          onClick={handleAudit}
          disabled={auditing || overLimit || !text.trim()}
          size="lg"
        >
          {auditing ? 'Auditing…' : 'Run Audit'}
        </Button>
      </div>
    </AppLayout>
  )
}
