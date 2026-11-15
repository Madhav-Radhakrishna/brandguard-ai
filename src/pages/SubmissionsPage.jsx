// pages/SubmissionsPage.jsx
// Table of submissions. Employees see only their own (RLS).
// Managers see all. Click a row to go to the detail view.
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import AppLayout from '../components/layout/AppLayout'
import PageHeader from '../components/layout/PageHeader'
import Button from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import Table, { TR, TD } from '../components/ui/Table'
import LoadingBar, { EmptyState } from '../components/ui/LoadingBar'

export default function SubmissionsPage() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('submissions')
        .select('*, findings(count)')
        .order('created_at', { ascending: false })
      setSubmissions(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const isManager = profile?.role === 'brand_manager'

  return (
    <AppLayout>
      {loading && <LoadingBar />}
      <PageHeader
        title={isManager ? 'All Submissions' : 'My Submissions'}
        action={<Button onClick={() => navigate('/submit')}>+ New Submission</Button>}
      />

      <div className="px-8 py-6">
        {!loading && submissions.length === 0 ? (
          <EmptyState
            message="No submissions yet."
            action={<Button onClick={() => navigate('/submit')}>Submit content</Button>}
          />
        ) : (
          <Table headers={['Date', 'Preview', 'Source', 'Version', 'Findings', 'Status']}>
            {submissions.map(s => (
              <TR key={s.id} onClick={() => navigate(`/submissions/${s.id}`)}>
                <TD mono className="whitespace-nowrap text-muted">
                  {new Date(s.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric'
                  })}
                </TD>
                <TD className="max-w-sm">
                  <span className="text-fg">
                    {s.text.length > 90 ? s.text.slice(0, 90) + '…' : s.text}
                  </span>
                </TD>
                <TD mono className="text-muted">{s.source}</TD>
                <TD mono className="text-muted">v{s.version}</TD>
                <TD mono className="text-muted">
                  {s.findings?.[0]?.count ?? 0}
                </TD>
                <TD><StatusBadge status={s.status} /></TD>
              </TR>
            ))}
          </Table>
        )}
      </div>
    </AppLayout>
  )
}
