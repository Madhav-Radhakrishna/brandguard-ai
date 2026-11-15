// components/auth/RequireAuth.jsx
// Redirects to /login if not authenticated.
// Optionally enforces a required role (e.g. 'brand_manager').
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function RequireAuth({ children, role }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <p className="text-muted text-sm font-mono uppercase tracking-widest">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Role check: redirect employees away from manager-only pages
  if (role && profile?.role !== role) {
    return <Navigate to="/submit" replace />
  }

  return children
}
