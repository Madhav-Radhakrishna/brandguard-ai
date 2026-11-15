// components/ui/Button.jsx
// primary  = solid red
// secondary = 1px outline
// text     = no border (tertiary)
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button',
  onClick,
}) {
  const base = 'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed'

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  }

  const variants = {
    primary:   'bg-accent text-white hover:bg-accent-hover',
    secondary: 'border border-border text-fg hover:border-fg bg-transparent',
    text:      'text-muted hover:text-fg bg-transparent px-0',
    danger:    'border border-accent text-accent hover:bg-accent hover:text-white',
  }

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
