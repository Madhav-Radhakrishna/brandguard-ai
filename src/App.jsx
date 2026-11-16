// App.jsx â€” root router with direct access (no login required)
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
import SubmissionDetailPage from './pages/SubmissionDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public / direct entry */}
          <Route path="/submit" element={<SubmitPage />} />
          <Route path="/submissions" element={<SubmissionsPage />} />
          <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
          <Route path="/assistant" element={<AssistantPage />} />

          {/* Manager pages protected by role toggle */}
          <Route path="/knowledge-hub" element={
            <RequireAuth role="brand_manager"><KnowledgeHubPage /></RequireAuth>
          } />
          <Route path="/memory" element={
            <RequireAuth role="brand_manager"><MemoryPage /></RequireAuth>
          } />
          <Route path="/insights" element={
            <RequireAuth role="brand_manager"><InsightsPage /></RequireAuth>
          } />

          {/* Fallback & root redirect to submit */}
          <Route path="/login" element={<Navigate to="/submit" replace />} />
          <Route path="/" element={<Navigate to="/submit" replace />} />
          <Route path="*" element={<Navigate to="/submit" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
