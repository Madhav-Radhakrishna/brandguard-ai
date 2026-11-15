// components/ui/LoadingBar.jsx
// Thin red animated bar at the top of the content area during async ops.
// Usage: {loading && <LoadingBar />}
export default function LoadingBar() {
  return <div className="progress-bar" style={{ width: '100%' }} />
}

// components/ui/EmptyState.jsx — inline export for convenience
export function EmptyState({ message, action }) {
  return (
    <div className="px-8 py-16 text-center">
      <p className="text-muted text-sm mb-4">{message}</p>
      {action}
    </div>
  )
}
