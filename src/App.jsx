// App.jsx — root router with auth protection
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import RequireAuth from './components/auth/RequireAuth'

import LoginPage         from './pages/LoginPage'
import SubmitPage        from './pages/SubmitPage'
import SubmissionsPage   from './pages/SubmissionsPage'
import KnowledgeHubPage  from './pages/KnowledgeHubPage'
import MemoryPage        from './pages/MemoryPage'
import InsightsPage      from './pages/InsightsPage'
import AssistantPage     from './pages/AssistantPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Authenticated — any role */}
          <Route path="/submit" element={
            <RequireAuth><SubmitPage /></RequireAuth>
          } />
          <Route path="/submissions" element={
            <RequireAuth><SubmissionsPage /></RequireAuth>
          } />
          <Route path="/assistant" element={
            <RequireAuth><AssistantPage /></RequireAuth>
          } />

          {/* Manager only */}
          <Route path="/knowledge-hub" element={
            <RequireAuth role="brand_manager"><KnowledgeHubPage /></RequireAuth>
          } />
          <Route path="/memory" element={
            <RequireAuth role="brand_manager"><MemoryPage /></RequireAuth>
          } />
          <Route path="/insights" element={
            <RequireAuth role="brand_manager"><InsightsPage /></RequireAuth>
          } />

          {/* Catch-all: redirect root to submit */}
          <Route path="/" element={<Navigate to="/submit" replace />} />
          <Route path="*" element={<Navigate to="/submit" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
