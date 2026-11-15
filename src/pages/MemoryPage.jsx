// pages/MemoryPage.jsx
// Manager-only: view all active feedback_memory cases, revoke entries.
// Memory informs future audits via cosine similarity — it is NEVER policy.
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import AppLayout from '../components/layout/AppLayout'
import PageHeader from '../components/layout/PageHeader'
import StatusBadge from '../components/ui/StatusBadge'
import Table, { TR, TD } from '../components/ui/Table'
import Button from '../components/ui/Button'
import LoadingBar, { EmptyState } from '../components/ui/LoadingBar'

export default function MemoryPage() {
  const { profile } = useAuth()
  const [cases,    setCases]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [revoking, setRevoking] = useState(null) // id being revoked
  const [filter,   setFilter]   = useState('active') // 'active' | 'revoked' | 'all'

  async function loadCases() {
    setLoading(true)
    let query = supabase
      .from('feedback_memory')
      .select('*, brand_rules(title, rule_key), profiles(full_name)')
      .order('created_at', { ascending: false })

    if (filter !== 'all') query = query.eq('status', filter)

    const { data } = await query
    setCases(data || [])
    setLoading(false)
  }

  useEffect(() => { loadCases() }, [filter])

  async function handleRevoke(id) {
    if (!window.confirm('Revoke this memory case? It will no longer influence future audits.')) return
    setRevoking(id)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/memory', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ memory_id: id }),
    })
    setRevoking(null)
    loadCases()
  }

  return (
    <AppLayout>
      {loading && <LoadingBar />}
      <PageHeader title="Memory" />

      {/* Info banner */}
      <div className="px-8 py-3 border-b border-border bg-[#141414] text-xs text-muted">
        Memory cases are confirmed findings stored as examples for future audits.
        They <strong className="text-fg">inform</strong> — they are never binding policy.
        Only approved brand rules are policy.
      </div>

      {/* Filter */}
      <div className="flex gap-3 px-8 py-4 border-b border-border">
        {['active', 'revoked', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs font-mono uppercase tracking-widest border transition-colors ${
              filter === f
                ? 'border-accent bg-accent/10 text-fg'
                : 'border-border text-muted hover:border-fg hover:text-fg'
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs font-mono text-muted self-center">
          {cases.length} case{cases.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="px-8 py-6">
        {!loading && cases.length === 0 ? (
          <EmptyState
            message={filter === 'active'
              ? 'No active memory cases yet. When a manager confirms a finding, it is stored here.'
              : 'No cases match this filter.'}
          />
        ) : (
          <Table headers={['Date', 'Flagged Text', 'Correction', 'Rule', 'Reviewed By', 'Status', '']}>
            {cases.map(c => (
              <TR key={c.id}>
                <TD mono className="text-muted whitespace-nowrap text-xs">
                  {new Date(c.created_at).toLocaleDateString('en-IN')}
                </TD>
                <TD className="max-w-xs">
                  <div className="text-fg text-sm">&ldquo;{c.case_text}&rdquo;</div>
                </TD>
                <TD className="max-w-xs">
                  <div className="text-muted text-sm italic">
                    {c.final_correction || '—'}
                  </div>
                </TD>
                <TD mono className="text-muted text-xs">
                  {c.brand_rules?.rule_key || '—'}
                </TD>
                <TD className="text-muted text-sm">
                  {c.profiles?.full_name || '—'}
                </TD>
                <TD><StatusBadge status={c.status} /></TD>
                <TD>
                  {c.status === 'active' && (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={revoking === c.id}
                      onClick={() => handleRevoke(c.id)}
                    >
                      {revoking === c.id ? 'Revoking…' : 'Revoke'}
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </Table>
        )}
      </div>
    </AppLayout>
  )
}
