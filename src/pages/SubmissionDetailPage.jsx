// pages/SubmissionDetailPage.jsx
// Split-pane review: original text on left, findings on right.
// Features Stage 4:
// - Employee actions per finding: accept / reject / edit
// - Resubmission workflow creating version n+1 linked to original
// - Manager review: confirm / reject findings + approve / request changes / reject submission
// - Version history navigation
import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import AppLayout from '../components/layout/AppLayout'
import PageHeader from '../components/layout/PageHeader'
import StatusBadge from '../components/ui/StatusBadge'
import Button from '../components/ui/Button'
import LoadingBar from '../components/ui/LoadingBar'
import ResubmitModal from '../components/submissions/ResubmitModal'
import { buildHighlightSegments, severityHighlight, severityBar } from '../utils/highlightText'

export default function SubmissionDetailPage() {
  const { id }      = useParams()
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [submission, setSubmission] = useState(null)
  const [findings,   setFindings]   = useState([])
  const [versions,   setVersions]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  // Modal & form states
  const [showResubmit, setShowResubmit] = useState(false)
  const [managerComment, setManagerComment] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const isManager = profile?.role === 'brand_manager'
  const isAuthor  = profile?.id === submission?.author_id

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: sub, error: subErr }, { data: fins, error: finErr }] = await Promise.all([
        supabase.from('submissions').select('*').eq('id', id).single(),
        supabase.from('findings')
          .select('*, brand_rules(title, rule_key, type)')
          .eq('submission_id', id)
      ])

      if (subErr || !sub) {
        setError('Submission not found or access denied.')
        setLoading(false)
        return
      }

      setSubmission(sub)
      setManagerComment(sub.manager_comment || '')

      const order = { high: 0, medium: 1, low: 2 }
      setFindings((fins || []).sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)))

      // Load version history (root parent, siblings, children)
      const rootId = sub.parent_submission_id || sub.id
      const { data: verData } = await supabase
        .from('submissions')
        .select('id, version, status, created_at')
        .or(`id.eq.${rootId},parent_submission_id.eq.${rootId},parent_submission_id.eq.${sub.id}`)
        .order('version', { ascending: true })

      setVersions(verData || [sub])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  // ── EMPLOYEE ACTIONS ────────────────────────────────────────────────────────
  async function handleEmployeeAction(findingId, action, correctionText = null) {
    setActionLoading(true)
    const updates = {
      employee_action: action,
      final_correction: correctionText,
    }

    const { error: updErr } = await supabase
      .from('findings')
      .update(updates)
      .eq('id', findingId)

    if (!updErr) {
      setFindings(prev => prev.map(f => f.id === findingId ? { ...f, ...updates } : f))
    }
    setActionLoading(false)
  }

  // ── MANAGER REVIEW ACTIONS ──────────────────────────────────────────────────
  async function handleManagerFindingReview(findingId, status) {
    setActionLoading(true)
    const updates = {
      review_status: status,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    }

    const { error: updErr } = await supabase
      .from('findings')
      .update(updates)
      .eq('id', findingId)

    if (!updErr) {
      setFindings(prev => prev.map(f => f.id === findingId ? { ...f, ...updates } : f))
    }
    setActionLoading(false)
  }

  async function handleSubmissionDecision(newStatus) {
    setActionLoading(true)
    const updates = {
      status: newStatus,
      manager_comment: managerComment.trim() || null,
    }

    const { error: updErr } = await supabase
      .from('submissions')
      .update(updates)
      .eq('id', submission.id)

    if (!updErr) {
      setSubmission(prev => ({ ...prev, ...updates }))
    }
    setActionLoading(false)
  }

  if (loading) return <AppLayout><LoadingBar /><div className="px-8 py-10 text-muted text-sm font-mono">Loading submission…</div></AppLayout>
  if (error)   return <AppLayout><div className="px-8 py-10 text-accent text-sm font-mono">{error}</div></AppLayout>

  const segments = buildHighlightSegments(submission.text, findings)

  return (
    <AppLayout>
      {actionLoading && <LoadingBar />}
      <PageHeader
        title={`Submission v${submission.version}`}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={submission.status} />
            {isAuthor && submission.status !== 'approved' && (
              <Button size="sm" onClick={() => setShowResubmit(true)}>
                Resubmit (v{(submission.version || 1) + 1})
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => navigate('/submissions')}>
              ← All Submissions
            </Button>
          </div>
        }
      />

      {/* Meta Bar + Version Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-8 py-3 border-b border-border bg-surface text-xs font-mono">
        <div className="flex items-center gap-6 text-muted">
          <span>Source: <strong className="text-fg uppercase">{submission.source}</strong></span>
          <span>Date: {new Date(submission.created_at).toLocaleString('en-IN')}</span>
          <span>Findings: <strong className="text-fg">{findings.length}</strong></span>
        </div>

        {/* Version History pills */}
        {versions.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-muted uppercase tracking-widest text-[10px]">Versions:</span>
            {versions.map(v => (
              <Link
                key={v.id}
                to={`/submissions/${v.id}`}
                className={`px-2 py-0.5 border text-xs transition-colors ${
                  v.id === submission.id
                    ? 'border-accent bg-accent/10 text-fg font-bold'
                    : 'border-border text-muted hover:border-fg hover:text-fg'
                }`}
              >
                v{v.version}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Manager Decision Banner (for brand managers) */}
      {isManager && (
        <div className="px-8 py-4 bg-[#141414] border-b border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex-1 w-full md:w-auto">
            <label className="text-[11px] font-mono uppercase tracking-widest text-muted block mb-1">
              Manager Review & Decision
            </label>
            <input
              type="text"
              value={managerComment}
              onChange={e => setManagerComment(e.target.value)}
              placeholder="Optional comment for employee..."
              className="w-full bg-surface border border-border text-fg text-xs px-3 py-1.5 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant={submission.status === 'approved' ? 'primary' : 'secondary'}
              disabled={actionLoading}
              onClick={() => handleSubmissionDecision('approved')}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant={submission.status === 'needs_changes' ? 'primary' : 'secondary'}
              disabled={actionLoading}
              onClick={() => handleSubmissionDecision('needs_changes')}
            >
              Request Changes
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={actionLoading}
              onClick={() => handleSubmissionDecision('rejected')}
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Existing Manager Comment display for employees */}
      {!isManager && submission.manager_comment && (
        <div className="px-8 py-3 bg-[#151515] border-b border-border text-xs flex items-center gap-3">
          <span className="font-mono uppercase text-muted tracking-widest">Manager Note:</span>
          <span className="text-fg font-medium">{submission.manager_comment}</span>
        </div>
      )}

      {/* ── SPLIT PANE ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row h-[calc(100vh-220px)]">

        {/* LEFT — original text with inline highlights */}
        <div className="w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-mono uppercase tracking-widest text-muted">
              Original Submission Text — read only
            </p>
            <span className="text-xs font-mono text-muted">{submission.text.length} chars</span>
          </div>
          <div className="text-sm leading-7 text-fg whitespace-pre-wrap break-words font-sans bg-surface p-5 border border-border">
            {segments.map((seg, i) =>
              seg.highlighted ? (
                <mark
                  key={i}
                  title={`Severity: ${seg.severity}`}
                  className={`cursor-default rounded-sm px-1 py-0.5 font-medium ${severityHighlight(seg.severity)}`}
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </div>
        </div>

        {/* RIGHT — findings list */}
        <div className="w-full lg:w-1/2 overflow-y-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-mono uppercase tracking-widest text-muted">
              Findings ({findings.length})
            </p>
            {isAuthor && submission.status !== 'approved' && (
              <span className="text-[11px] font-mono text-muted">
                Accept, reject or edit each finding before resubmitting
              </span>
            )}
          </div>

          {findings.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border p-6">
              <p className="text-muted text-sm mb-1">No violations or issues found.</p>
              <p className="text-xs text-muted font-mono">Complies with approved brand guidelines.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {findings.map(finding => (
                <FindingInteractiveCard
                  key={finding.id}
                  finding={finding}
                  isManager={isManager}
                  isAuthor={isAuthor}
                  submissionApproved={submission.status === 'approved'}
                  onEmployeeAction={handleEmployeeAction}
                  onManagerReview={handleManagerFindingReview}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Resubmit Modal */}
      {showResubmit && (
        <ResubmitModal
          submission={submission}
          findings={findings}
          onClose={() => setShowResubmit(false)}
        />
      )}
    </AppLayout>
  )
}

// ── INTERACTIVE FINDING CARD ────────────────────────────────────────────────
function FindingInteractiveCard({
  finding,
  isManager,
  isAuthor,
  submissionApproved,
  onEmployeeAction,
  onManagerReview,
}) {
  const rule = finding.brand_rules
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(finding.final_correction || finding.suggestion || '')

  function saveEdit() {
    onEmployeeAction(finding.id, 'edited', editText)
    setEditing(false)
  }

  return (
    <div className={`bg-surface p-4 border border-border ${severityBar(finding.severity)} flex flex-col gap-3`}>
      {/* Header tags */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 bg-black border border-border text-muted">
            {finding.category}
          </span>
          <StatusBadge status={finding.severity} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {finding.source === 'rule_engine' ? 'Rule Engine' : 'Gemini'}
          </span>
          {finding.memory_case_id && (
            <span className="font-mono text-[10px] text-accent">
              ★ Informed by past case
            </span>
          )}
        </div>

        {/* Manager review badge */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase text-muted">Review:</span>
          <StatusBadge status={finding.review_status} />
        </div>
      </div>

      {/* Flagged text */}
      <div>
        <span className="font-mono text-[11px] text-muted uppercase tracking-wider block mb-0.5">
          Flagged text
        </span>
        <div className="text-sm text-fg font-medium bg-[#0A0A0A] p-2 border border-border">
          &ldquo;{finding.original_text}&rdquo;
        </div>
      </div>

      {/* Explanation */}
      <p className="text-xs text-muted leading-relaxed">{finding.explanation}</p>

      {/* Rule cited */}
      {rule && (
        <div className="text-xs border-l-2 border-border pl-2 py-0.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted mr-1.5">Rule Cited:</span>
          <span className="font-mono text-fg font-semibold">{rule.rule_key}</span>
          <span className="text-muted ml-1.5">({rule.title})</span>
        </div>
      )}

      {/* Suggestion */}
      <div className="bg-[#141414] p-3 border border-border text-xs">
        <span className="font-mono uppercase tracking-widest text-[10px] text-muted block mb-1">
          Suggested Fix
        </span>
        <div className="text-fg">{finding.suggestion}</div>
      </div>

      {/* Employee Correction Display (if set) */}
      {finding.employee_action !== 'none' && (
        <div className="text-xs font-mono flex items-center gap-2 pt-1">
          <span className="text-muted uppercase">Employee Action:</span>
          <span className="text-fg font-bold uppercase">{finding.employee_action}</span>
          {finding.final_correction && (
            <span className="text-muted normal-case font-sans">
              &rarr; &ldquo;{finding.final_correction}&rdquo;
            </span>
          )}
        </div>
      )}

      {/* ── EMPLOYEE ACTIONS (Accept / Reject / Edit) ── */}
      {isAuthor && !submissionApproved && (
        <div className="pt-2 border-t border-border flex flex-col gap-2">
          {!editing ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onEmployeeAction(finding.id, 'accepted', finding.suggestion)}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors border ${
                  finding.employee_action === 'accepted'
                    ? 'bg-green-950 border-green-500 text-green-200'
                    : 'border-border text-muted hover:border-fg hover:text-fg'
                }`}
              >
                Accept Fix
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors border ${
                  finding.employee_action === 'edited'
                    ? 'bg-blue-950 border-blue-500 text-blue-200'
                    : 'border-border text-muted hover:border-fg hover:text-fg'
                }`}
              >
                Edit Fix
              </button>
              <button
                type="button"
                onClick={() => onEmployeeAction(finding.id, 'rejected', null)}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors border ${
                  finding.employee_action === 'rejected'
                    ? 'bg-red-950 border-red-500 text-red-200'
                    : 'border-border text-muted hover:border-fg hover:text-fg'
                }`}
              >
                Reject Finding
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 bg-[#0A0A0A] p-2 border border-border">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted">
                Custom Replacement
              </label>
              <input
                type="text"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="w-full bg-surface border border-border text-fg text-xs px-2 py-1.5 focus:outline-none focus:border-accent"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={saveEdit}>Save Edit</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MANAGER ACTIONS (Confirm / Reject Finding) ── */}
      {isManager && (
        <div className="pt-2 border-t border-border flex items-center justify-between text-xs font-mono">
          <span className="text-muted uppercase text-[10px] tracking-widest">Manager Assessment:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onManagerReview(finding.id, 'confirmed')}
              className={`px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors border ${
                finding.review_status === 'confirmed'
                  ? 'bg-green-950 border-green-500 text-green-200 font-bold'
                  : 'border-border text-muted hover:border-fg hover:text-fg'
              }`}
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => onManagerReview(finding.id, 'rejected')}
              className={`px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors border ${
                finding.review_status === 'rejected'
                  ? 'bg-red-950 border-red-500 text-red-200 font-bold'
                  : 'border-border text-muted hover:border-fg hover:text-fg'
              }`}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
