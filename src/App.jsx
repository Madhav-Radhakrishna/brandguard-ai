// App.jsx — root component, router will be added in Stage 1
function App() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          {/* BrandGuard wordmark: red square + name */}
          <span className="inline-block w-8 h-8 bg-accent" aria-hidden="true" />
          <span className="text-2xl font-semibold tracking-tight">BrandGuard AI</span>
        </div>
        <p className="text-muted text-sm font-mono uppercase tracking-widest">
          Stage 0 — Setup complete
        </p>
      </div>
    </div>
  )
}

export default App
