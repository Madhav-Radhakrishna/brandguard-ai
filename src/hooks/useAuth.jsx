// hooks/useAuth.jsx
// No sign-in required! Role toggle mode for hackathon judges & reviewers.
// Instantly switches between "Employee" and "Brand Manager" via UI toggle button.
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const DEMO_EMPLOYEE = {
  id: '00000000-0000-0000-0000-000000000001',
  full_name: 'Rahul Verma (Employee)',
  role: 'employee',
  department: 'Marketing & Content',
}

const DEMO_MANAGER = {
  id: '00000000-0000-0000-0000-000000000002',
  full_name: 'Priya Sharma (Manager)',
  role: 'brand_manager',
  department: 'Brand Management',
}

export function AuthProvider({ children }) {
  // Load initial role from localStorage or default to employee
  const [role, setRole] = useState(() => {
    return localStorage.getItem('brandguard_demo_role') || 'employee'
  })

  // Mock profile based on selected role
  const profile = role === 'brand_manager' ? DEMO_MANAGER : DEMO_EMPLOYEE

  // Mock session object so all session-checks in app pass smoothly
  const session = {
    user: {
      id: profile.id,
      email: role === 'brand_manager' ? 'manager@learnbridge.demo' : 'employee@learnbridge.demo',
      user_metadata: { full_name: profile.full_name },
    },
    access_token: 'demo-token-' + profile.role,
  }

  function toggleRole() {
    const nextRole = role === 'employee' ? 'brand_manager' : 'employee'
    setRole(nextRole)
    localStorage.setItem('brandguard_demo_role', nextRole)
  }

  function switchRole(newRole) {
    setRole(newRole)
    localStorage.setItem('brandguard_demo_role', newRole)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        role,
        loading: false,
        toggleRole,
        switchRole,
        isManager: role === 'brand_manager',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
