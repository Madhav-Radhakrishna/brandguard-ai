// components/layout/Sidebar.jsx
// Fixed left sidebar: BrandGuard wordmark, nav links, user info + logout.
// Active item: 2px red left border + white text. Text-only links, no icons.
import { NavLink, useNavigate } from 'react-router-dom'
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
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const links = profile?.role === 'brand_manager' ? managerLinks : employeeLinks

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 bg-surface border-r border-border flex flex-col z-30">
      {/* Wordmark */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <span className="inline-block w-6 h-6 bg-accent flex-shrink-0" aria-hidden="true" />
        <span className="font-semibold text-fg text-base tracking-tight">BrandGuard AI</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4 overflow-y-auto">
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

      {/* User info + logout */}
      <div className="px-5 py-4 border-t border-border">
        <p className="text-xs font-mono uppercase tracking-widest text-muted mb-0.5">
          {profile?.role === 'brand_manager' ? 'Brand Manager' : 'Employee'}
        </p>
        <p className="text-sm text-fg truncate mb-3">
          {profile?.full_name || 'Loading...'}
        </p>
        <button
          onClick={handleLogout}
          className="text-xs text-muted hover:text-accent transition-colors font-mono uppercase tracking-widest"
        >
          Logout
        </button>
      </div>
    </aside>
  )
}
