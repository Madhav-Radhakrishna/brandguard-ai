// components/ui/Input.jsx
// Label above field. 1px border on #111 bg. Red focus ring. Error text below.
export default function Input({
  label,
  id,
  error,
  className = '',
  textarea = false,
  rows = 4,
  ...props
}) {
  const fieldClass = `
    w-full bg-surface border border-border text-fg text-sm px-3 py-2
    focus:outline-none focus:border-accent
    placeholder:text-muted
    ${error ? 'border-accent' : ''}
    ${className}
  `

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-mono uppercase tracking-widest text-muted">
          {label}
        </label>
      )}
      {textarea ? (
        <textarea id={id} rows={rows} className={fieldClass} {...props} />
      ) : (
        <input id={id} className={fieldClass} {...props} />
      )}
      {error && (
        <p className="text-xs text-accent">{error}</p>
      )}
    </div>
  )
}
