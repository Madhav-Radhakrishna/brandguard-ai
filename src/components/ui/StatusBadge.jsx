// components/ui/StatusBadge.jsx
// Small mono uppercase text label with a dot. NOT a coloured pill.
// Dot colour reflects severity/status meaning.
const configs = {
  // submission statuses
  pending_review: { dot: 'bg-muted',   label: 'Pending Review' },
  needs_changes:  { dot: 'bg-yellow-500', label: 'Needs Changes' },
  approved:       { dot: 'bg-green-500',  label: 'Approved' },
  rejected:       { dot: 'bg-accent',     label: 'Rejected' },
  // finding review statuses
  pending:        { dot: 'bg-muted',      label: 'Pending' },
  confirmed:      { dot: 'bg-green-500',  label: 'Confirmed' },
  // rule statuses
  draft:          { dot: 'bg-yellow-500', label: 'Draft' },
  archived:       { dot: 'bg-muted',      label: 'Archived' },
  // severity
  high:           { dot: 'bg-accent',     label: 'High' },
  medium:         { dot: 'bg-orange-400', label: 'Medium' },
  low:            { dot: 'bg-muted',      label: 'Low' },
  // memory
  active:         { dot: 'bg-green-500',  label: 'Active' },
  revoked:        { dot: 'bg-muted',      label: 'Revoked' },
  // employee action
  none:           { dot: 'bg-muted',      label: 'No Action' },
  accepted:       { dot: 'bg-green-500',  label: 'Accepted' },
  edited:         { dot: 'bg-blue-400',   label: 'Edited' },
}

export default function StatusBadge({ status }) {
  const cfg = configs[status] ?? { dot: 'bg-muted', label: status }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
        {cfg.label}
      </span>
    </span>
  )
}
