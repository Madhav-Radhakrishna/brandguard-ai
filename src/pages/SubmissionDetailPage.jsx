// pages/SubmissionDetailPage.jsx
// Split-pane review: original text on left, findings on right.
// Employee actions (accept / reject / edit) + Resubmit.
// Manager actions: confirm/reject each finding + approve/reject/request-changes on submission.
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

  const [submission,     setSubmission]     = useState(null)
  const [findings,       setFindings]       = useState([])
  const [versions,       setVersions]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [showResubmit,   setShowResubmit]   = useState(false)
  const [managerComment, setManagerComment] = useState('')
  const [actionLoading,  setActionLoading]  = useState(false)

  // isManager is known once profile loads. RLS already limits which submissions an employee can see.
  const isManager = profile?.role === 'brand_manager'

  async function loadData() {
    setLoading(true)
    try {
      const [subResult, finResult] = await Promise.all([
        supabase.from('submissions').select('*').eq('id', id).single(),
        supabase.from('findings')
          .select('*, brand_rules(title, rule_key, type, replacement)')
          .eq('submission_id', id),
      ])

      if (subResult.error || !subResult.data) {
        setError('Submission not found or access denied.')
        setLoading(false)
        return
      }

      setSubmission(subResult.data)
      setManagerComment(subResult.data.manager_comment || '')

      const order = { high: 0, medium: 1, low: 2 }
      const sorted = (finResult.data || []).sort(
        (a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
      )
      setFindings(sorted)

      // Load version chain: find root, get all siblings/children
      const sub    = subResult.data
      const rootId = sub.parent_submission_id || sub.id
      const { data: verData } = await supabase
        .from('submissions')
        .select('id, version, status, created_at')
        .or(`id.eq.${rootId},parent_submission_id.eq.${rootId}`)
        .order('version', { ascending: true })
      setVersions(verData || [sub])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [id])

  // ── EMPLOYEE: accept / reject / edit a single finding ────────────────────
  async function handleEmployeeAction(findingId, action, correction = null) {
    setActionLoading(true)
    const patch = { employee_action: action, final_correction: correction }
    const { error: err } = await supabase.from('findings').update(patch).eq('id', findingId)
    if (!err) setFindings(prev => prev.map(f => f.id === findingId ? { ...f, ...patch } : f))
    setActionLoading(false)
  }

  // ── MANAGER: confirm / reject a single finding + store memory on confirm ──
  async function handleManagerFindingReview(findingId, status) {
    setActionLoading(true)
    const patch = {
      review_status: status,
      reviewed_by:   profile.id,
      reviewed_at:   new Date().toISOString(),
    }
    const { error: err } = await supabase.from('findings').update(patch).eq('id', findingId)
    if (!err) {
      setFindings(prev => prev.map(f => f.id === findingId ? { ...f, ...patch } : f))

      // When CONFIRMED → store as memory case (embedding happens server-side)
      if (status === 'confirmed') {
        const finding = findings.find(f => f.id === findingId)
        if (finding) {
          const { data: { session } } = await supabase.auth.getSession()
          fetch('/api/memory', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              finding_id:       finding.id,
              rule_id:          finding.rule_id || null,
              case_text:        finding.original_text,
              final_correction: finding.final_correction || null,
            }),
          }).catch(e => console.error('Memory store failed (non-fatal):', e.message))
          // Fire-and-forget — UI doesn't wait for embedding to complete
        }
      }
    }
    setActionLoading(false)
  }

  // ── MANAGER: approve / request changes / reject submission ────────────────
  async function handleSubmissionDecision(newStatus) {
    setActionLoading(true)
    const patch = { status: newStatus, manager_comment: managerComment.trim() || null }
    const { error: err } = await supabase.from('submissions').update(patch).eq('id', submission.id)
    if (!err) setSubmission(prev => ({ ...prev, ...patch }))
    setActionLoading(false)
  }

  if (loading) return (
    <AppLayout>
      <LoadingBar />
      <div className="px-8 py-10 text-muted text-sm font-mono">Loading submission…</div>
    </AppLayout>
  )
  if (error) return (
    <AppLayout>
      <div className="px-8 py-10 text-accent text-sm">{error}</div>
    </AppLayout>
  )

  const segments           = buildHighlightSegments(submission.text, findings)
  const isApproved         = submission.status === 'approved'
  // Employees can act on their own submission as long as it is not yet approved.
  // We use !isManager (instead of isAuthor) because RLS already ensures employees
  // can only fetch their own submissions — so if an employee sees this page, it's theirs.
  const showEmployeeActions = !isManager && !isApproved

  return (
    <AppLayout>
      {actionLoading && <LoadingBar />}

      <PageHeader
        title={`Submission v${submission.version}`}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={submission.status} />
            {showEmployeeActions && (
              <Button size="sm" onClick={() => setShowResubmit(true)}>
                Resubmit (v{submission.version + 1})
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => navigate('/submissions')}>
              ← Back
            </Button>
          </div>
        }
      />

      {/* ── META BAR + VERSION TABS ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-8 py-3 border-b border-border bg-surface text-xs font-mono text-muted">
        <div className="flex items-center gap-6">
          <span>Source: <strong className="text-fg uppercase">{submission.source}</strong></span>
          <span>{new Date(submission.created_at).toLocaleString('en-IN')}</span>
          <span>Findings: <strong className="text-fg">{findings.length}</strong></span>
        </div>
        {versions.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="uppercase text-[10px] tracking-widest mr-1">Versions:</span>
            {versions.map(v => (
              <Link
                key={v.id}
                to={`/submissions/${v.id}`}
                className={`px-2 py-0.5 border text-xs transition-colors ${
                  v.id === submission.id
                    ? 'border-accent text-fg font-bold bg-accent/10'
                    : 'border-border text-muted hover:border-fg hover:text-fg'
                }`}
              >
                v{v.version}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── MANAGER DECISION PANEL ─────────────────────────────────────────── */}
      {isManager && (
        <div className="px-8 py-4 border-b border-border bg-[#141414] flex flex-col md:flex-row gap-4 items-start md:items-center">
          <input
            type="text"
            value={managerComment}
            onChange={e => setManagerComment(e.target.value)}
            placeholder="Optional comment for the employee…"
            className="flex-1 bg-surface border border-border text-fg text-xs px-3 py-2 focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={actionLoading} onClick={() => handleSubmissionDecision('approved')}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" disabled={actionLoading} onClick={() => handleSubmissionDecision('needs_changes')}>
              Request Changes
            </Button>
            <Button size="sm" variant="danger" disabled={actionLoading} onClick={() => handleSubmissionDecision('rejected')}>
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Manager comment visible to employee */}
      {!isManager && submission.manager_comment && (
        <div className="px-8 py-3 bg-[#141414] border-b border-border text-xs flex gap-2 items-center">
          <span className="font-mono uppercase tracking-widest text-muted">Manager note:</span>
          <span className="text-fg">{submission.manager_comment}</span>
        </div>
      )}

      {/* ── SPLIT PANE ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row" style={{ height: 'calc(100vh - 200px)' }}>

        {/* LEFT — original text with highlights */}
        <div className="w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto px-8 py-6">
          <p className="text-xs font-mono uppercase tracking-widest text-muted mb-4">
            Original Text — read only
          </p>
          <div className="text-sm leading-relaxed text-fg whitespace-pre-wrap break-words bg-surface border border-border p-5">
            {segments.map((seg, i) =>
              seg.highlighted ? (
                <mark
                  key={i}
                  title={`Severity: ${seg.severity}`}
                  className={`rounded-sm px-0.5 ${severityHighlight(seg.severity)}`}
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </div>
        </div>

        {/* RIGHT — findings */}
        <div className="w-full lg:w-1/2 overflow-y-auto px-6 py-6">
          <p className="text-xs font-mono uppercase tracking-widest text-muted mb-4">
            Findings ({findings.length})
            {showEmployeeActions && (
              <span className="normal-case font-sans text-muted ml-2">
                — Accept, Edit, or Reject each finding below
              </span>
            )}
          </p>

          {findings.length === 0 ? (
            <div className="border border-dashed border-border py-16 text-center">
              <p className="text-muted text-sm">No violations found. Content looks compliant.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {findings.map(finding => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  isManager={isManager}
                  showEmployeeActions={showEmployeeActions}
                  onEmployeeAction={handleEmployeeAction}
                  onManagerReview={handleManagerFindingReview}
                />
              ))}
            </div>
          )}

          {/* partial notice */}
          <p className="text-xs text-muted mt-6 pt-4 border-t border-border">
            Rule engine findings are deterministic and always shown.
            {partial => partial ? ' AI analysis was unavailable — results are partial.' : ''}
          </p>
        </div>
      </div>

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

// ── FINDING CARD ─────────────────────────────────────────────────────────────
function FindingCard({ finding, isManager, showEmployeeActions, onEmployeeAction, onManagerReview }) {
  const [editing,   setEditing]   = useState(false)
  const [editText,  setEditText]  = useState(
    finding.final_correction || finding.suggestion || ''
  )
  const rule = finding.brand_rules

  function saveEdit() {
    onEmployeeAction(finding.id, 'edited', editText.trim())
    setEditing(false)
  }

  const empAction = finding.employee_action // 'none' | 'accepted' | 'rejected' | 'edited'

  return (
    <div className={`bg-surface border border-border p-4 ${severityBar(finding.severity)}`}>

      {/* Row 1: tags */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="font-mono text-[10px] uppercase tracking-widest bg-[#0A0A0A] border border-border px-1.5 py-0.5 text-muted">
          {finding.category}
        </span>
        <StatusBadge status={finding.severity} />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          {finding.source === 'rule_engine' ? 'Rule Engine' : 'Gemini AI'}
        </span>
        {finding.memory_case_id && (
          <span className="font-mono text-[10px] text-accent">★ Past case</span>
        )}
        <span className="ml-auto">
          <StatusBadge status={finding.review_status} />
        </span>
      </div>

      {/* Flagged text */}
      <div className="mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-1">Flagged</div>
        <div className="bg-[#0A0A0A] border border-border px-3 py-2 text-sm text-fg font-medium">
          &ldquo;{finding.original_text}&rdquo;
        </div>
      </div>

      {/* Explanation */}
      <p className="text-xs text-muted leading-relaxed mb-3">{finding.explanation}</p>

      {/* Rule cited */}
      {rule && (
        <div className="text-xs mb-3 flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase text-muted tracking-widest">Rule:</span>
          <span className="font-mono bg-[#0A0A0A] border border-border px-1.5 py-0.5 text-xs text-muted">
            {rule.rule_key}
          </span>
          <span className="text-muted">{rule.title}</span>
        </div>
      )}

      {/* Suggested fix */}
      <div className="bg-[#141414] border border-border p-3 mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-1">Suggested Fix</div>
        <div className="text-xs text-fg">{finding.suggestion}</div>
      </div>

      {/* Employee correction display */}
      {empAction !== 'none' && (
        <div className="text-xs font-mono flex items-center gap-2 mb-3 pb-3 border-b border-border">
          <span className="text-muted uppercase text-[10px]">Your action:</span>
          <span className={`uppercase font-bold ${
            empAction === 'accepted' ? 'text-green-400'
            : empAction === 'edited' ? 'text-blue-400'
            : 'text-red-400'
          }`}>
            {empAction}
          </span>
          {finding.final_correction && (
            <span className="text-muted normal-case font-sans">
              → &ldquo;{finding.final_correction}&rdquo;
            </span>
          )}
        </div>
      )}

      {/* ── EMPLOYEE ACTION BUTTONS ───────────────────────────────── */}
      {showEmployeeActions && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              // Store the replacement WORD (not the full suggestion sentence)
              // so the resubmit modal can substitute cleanly.
              const replacement = finding.brand_rules?.replacement || null
              onEmployeeAction(finding.id, 'accepted', replacement)
            }}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${
              empAction === 'accepted'
                ? 'border-green-500 bg-green-950 text-green-200 font-bold'
                : 'border-border text-muted hover:border-fg hover:text-fg'
            }`}
          >
            ✓ Accept Fix
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${
              empAction === 'edited'
                ? 'border-blue-500 bg-blue-950 text-blue-200 font-bold'
                : 'border-border text-muted hover:border-fg hover:text-fg'
            }`}
          >
            ✎ Edit Fix
          </button>
          <button
            type="button"
            onClick={() => onEmployeeAction(finding.id, 'rejected', null)}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${
              empAction === 'rejected'
                ? 'border-accent bg-red-950 text-red-200 font-bold'
                : 'border-border text-muted hover:border-fg hover:text-fg'
            }`}
          >
            ✗ Reject Finding
          </button>
        </div>
      )}

      {/* Edit inline form */}
      {showEmployeeActions && editing && (
        <div className="bg-[#0A0A0A] border border-border p-3 flex flex-col gap-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted">
            Custom replacement text
          </label>
          <input
            type="text"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            autoFocus
            className="w-full bg-surface border border-border text-fg text-xs px-3 py-2 focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={saveEdit}>Save</Button>
          </div>
        </div>
      )}

      {/* ── MANAGER ACTIONS ──────────────────────────────────────── */}
      {isManager && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
            Manager assessment:
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onManagerReview(finding.id, 'confirmed')}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${
                finding.review_status === 'confirmed'
                  ? 'border-green-500 bg-green-950 text-green-200 font-bold'
                  : 'border-border text-muted hover:border-fg hover:text-fg'
              }`}
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => onManagerReview(finding.id, 'rejected')}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${
                finding.review_status === 'rejected'
                  ? 'border-accent bg-red-950 text-red-200 font-bold'
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
