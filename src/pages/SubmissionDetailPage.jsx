// pages/SubmissionDetailPage.jsx
// Split-pane review: original text (with highlights) on the left,
// findings list on the right. The original text is NEVER overwritten.
// Employee actions (accept/reject/edit) are in Stage 4.
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import AppLayout from '../components/layout/AppLayout'
import PageHeader from '../components/layout/PageHeader'
import StatusBadge from '../components/ui/StatusBadge'
import Button from '../components/ui/Button'
import LoadingBar from '../components/ui/LoadingBar'
import { buildHighlightSegments, severityHighlight, severityBar } from '../utils/highlightText'

export default function SubmissionDetailPage() {
  const { id }      = useParams()
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [submission, setSubmission] = useState(null)
  const [findings,   setFindings]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: sub, error: subErr }, { data: fins, error: finErr }] = await Promise.all([
        supabase.from('submissions').select('*').eq('id', id).single(),
        supabase.from('findings')
          .select('*, brand_rules(title, rule_key, type)')
          .eq('submission_id', id)
          .order('severity', { ascending: true }), // high first (h < l alphabetically reversed below)
      ])
      if (subErr) { setError('Submission not found or access denied.'); setLoading(false); return }
      setSubmission(sub)
      // Sort: high > medium > low
      const order = { high: 0, medium: 1, low: 2 }
      setFindings((fins || []).sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)))
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <AppLayout><LoadingBar /><div className="px-8 py-10 text-muted text-sm">Loading…</div></AppLayout>
  if (error)   return <AppLayout><div className="px-8 py-10 text-accent text-sm">{error}</div></AppLayout>

  const segments  = buildHighlightSegments(submission.text, findings)
  const isManager = profile?.role === 'brand_manager'

  return (
    <AppLayout>
      <PageHeader
        title={`Submission v${submission.version}`}
        action={
          <div className="flex items-center gap-4">
            <StatusBadge status={submission.status} />
            <Button variant="secondary" size="sm" onClick={() => navigate('/submissions')}>
              ← All Submissions
            </Button>
          </div>
        }
      />

      {/* Meta row */}
      <div className="flex gap-8 px-8 py-3 border-b border-border text-xs font-mono text-muted uppercase tracking-widest">
        <span>Source: {submission.source}</span>
        <span>Submitted: {new Date(submission.created_at).toLocaleString('en-IN')}</span>
        <span>Findings: {findings.length}</span>
        {submission.manager_comment && (
          <span className="text-fg normal-case font-sans text-sm">
            Manager comment: {submission.manager_comment}
          </span>
        )}
      </div>

      {/* ── SPLIT PANE ─────────────────────────────────────────────────────── */}
      <div className="flex h-[calc(100vh-180px)]">

        {/* LEFT — original text with inline highlights */}
        <div className="w-1/2 border-r border-border overflow-y-auto px-8 py-6">
          <p className="text-xs font-mono uppercase tracking-widest text-muted mb-4">
            Original Text — read only
          </p>
          <p className="text-sm leading-7 text-fg whitespace-pre-wrap break-words">
            {segments.map((seg, i) =>
              seg.highlighted ? (
                <mark
                  key={i}
                  title={`Severity: ${seg.severity}`}
                  className={`cursor-default rounded-sm px-0.5 ${severityHighlight(seg.severity)}`}
                  style={{ background: 'inherit' }}
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </p>
        </div>

        {/* RIGHT — findings list */}
        <div className="w-1/2 overflow-y-auto px-6 py-6">
          <p className="text-xs font-mono uppercase tracking-widest text-muted mb-4">
            Findings ({findings.length})
          </p>

          {findings.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted text-sm">No issues found. Content looks good.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {findings.map(finding => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          )}

          {/* Partial warning */}
          {submission.status === 'pending_review' && (
            <p className="text-xs text-muted mt-6 border-t border-border pt-4">
              Rule engine findings are always shown. AI tone/claim analysis may not appear
              if the Gemini API was unavailable during this audit.
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

// ── FINDING CARD ─────────────────────────────────────────────────────────────
function FindingCard({ finding }) {
  const rule = finding.brand_rules

  return (
    <div className={`bg-surface pl-4 pr-4 py-4 ${severityBar(finding.severity)}`}>
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          {finding.category}
        </span>
        <span className="font-mono text-[10px] text-muted">·</span>
        <StatusBadge status={finding.severity} />
        <span className="font-mono text-[10px] text-muted">·</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          {finding.source === 'rule_engine' ? 'Rule Engine' : 'AI'}
        </span>
        {finding.memory_case_id && (
          <>
            <span className="font-mono text-[10px] text-muted">·</span>
            <span className="font-mono text-[10px] text-muted italic">informed by past case</span>
          </>
        )}
      </div>

      {/* Flagged text */}
      <p className="text-sm text-fg mb-1">
        <span className="font-mono text-xs text-muted mr-1">Flagged:</span>
        <span className="bg-zinc-800 px-1 rounded text-sm">&ldquo;{finding.original_text}&rdquo;</span>
      </p>

      {/* Explanation */}
      <p className="text-sm text-muted mb-2 leading-relaxed">{finding.explanation}</p>

      {/* Rule cited */}
      {rule && (
        <div className="mb-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted mr-1">Rule:</span>
          <span className="font-mono text-[10px] bg-zinc-800 px-1.5 py-0.5 text-muted">
            {rule.rule_key}
          </span>
          <span className="text-xs text-muted ml-1">{rule.title}</span>
        </div>
      )}

      {/* Suggestion */}
      <div className="border-t border-border pt-2 mt-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted mr-1">
          Suggestion:
        </span>
        <span className="text-sm text-fg">{finding.suggestion}</span>
      </div>

      {/* Review status (Stage 4 adds action buttons here) */}
      <div className="mt-2">
        <StatusBadge status={finding.review_status} />
      </div>
    </div>
  )
}
