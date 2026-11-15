// components/layout/AppLayout.jsx
// Main authenticated layout: fixed sidebar + scrollable content area.
import Sidebar from './Sidebar'

export default function AppLayout({ children }) {
  return (
    <div className="flex h-screen bg-bg">
      <Sidebar />
      {/* Content area pushed right of the 240px sidebar */}
      <main className="flex-1 ml-60 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
