// components/auth/RequireAuth.jsx
// No sign-in needed. Evaluates role directly for role-gated pages.
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function RequireAuth({ children, role }) {
  const { profile, isManager } = useAuth()

  // If a page specifically requires brand_manager and user is on employee mode,
  // redirect them to /submit or let them toggle
  if (role === 'brand_manager' && !isManager) {
    return <Navigate to="/submit" replace />
  }

  return children
}
