// components/ui/Table.jsx
// Shared table shell: mono uppercase headers, 1px row dividers, hover highlight.
// Usage: <Table headers={[...]} rows={[...]} />  or use as compound component.
export default function Table({ headers, children, empty }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-widest text-muted whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
        </tbody>
      </table>
      {!children && empty && (
        <div className="px-4 py-10 text-center text-muted text-sm">{empty}</div>
      )}
    </div>
  )
}

// TR with hover highlight and 1px divider
export function TR({ children, onClick, className = '' }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-border hover:bg-[#151515] transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  )
}

// Standard cell
export function TD({ children, className = '', mono = false }) {
  return (
    <td className={`px-4 py-3 text-fg align-top ${mono ? 'font-mono text-xs' : ''} ${className}`}>
      {children}
    </td>
  )
}
