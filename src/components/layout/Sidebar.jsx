// components/layout/Sidebar.jsx
// Fixed left sidebar: BrandGuard wordmark, nav links, role switcher toggle.
// Role Toggle lets judges switch between Employee and Brand Manager anytime without login.
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// Nav items per role
const employeeLinks = [
  { to: '/submit',          label: 'Submit Content' },
  { to: '/submissions',     label: 'My Submissions' },
  { to: '/assistant',       label: 'Brand Assistant' },
]
const managerLinks = [
  { to: '/submit',          label: 'Submit Content' },
  { to: '/submissions',     label: 'All Submissions' },
  { to: '/knowledge-hub',   label: 'Knowledge Hub' },
  { to: '/memory',          label: 'Memory' },
  { to: '/insights',        label: 'Insights' },
  { to: '/assistant',       label: 'Brand Assistant' },
]

export default function Sidebar() {
  const { profile, role, toggleRole, isManager } = useAuth()
  const links = isManager ? managerLinks : employeeLinks

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 bg-surface border-r border-border flex flex-col z-30">
      {/* Wordmark */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <span className="inline-block w-6 h-6 bg-accent flex-shrink-0" aria-hidden="true" />
        <span className="font-semibold text-fg text-base tracking-tight">BrandGuard AI</span>
      </div>

      {/* Role Switcher Pill / Toggle */}
      <div className="p-3 mx-4 my-3 bg-[#121212] border border-border rounded flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
            Current Role
          </span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
            isManager ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-blue-900/30 text-blue-300 border border-blue-500/30'
          }`}>
            {isManager ? 'Manager' : 'Employee'}
          </span>
        </div>

        <button
          onClick={toggleRole}
          className="w-full py-1.5 px-2 text-xs font-mono font-medium tracking-wide bg-surface hover:bg-border/60 text-fg border border-border hover:border-fg transition-all flex items-center justify-center gap-1.5 rounded"
          title="Click to toggle between Employee and Manager view"
        >
          <span>⇄ Switch to {isManager ? 'Employee' : 'Manager'}</span>
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `block px-5 py-2.5 text-sm transition-colors
               ${isActive
                 ? 'border-l-2 border-accent text-fg font-medium pl-[18px]'
                 : 'border-l-2 border-transparent text-muted hover:text-fg pl-[18px]'
               }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Active User info */}
      <div className="px-5 py-4 border-t border-border">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted mb-0.5">
          Active Persona
        </p>
        <p className="text-sm font-medium text-fg truncate">
          {profile?.full_name}
        </p>
        <p className="text-xs text-muted truncate mt-0.5">
          {profile?.department}
        </p>
      </div>
    </aside>
  )
}
