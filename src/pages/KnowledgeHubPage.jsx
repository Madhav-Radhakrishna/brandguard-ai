// pages/KnowledgeHubPage.jsx
// Manager-only: list all rules, add new, approve draft, archive, edit-as-new-version.
// Rules are insert-only: editing creates a NEW row with the same rule_key.
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import AppLayout from '../components/layout/AppLayout'
import PageHeader from '../components/layout/PageHeader'
import Button from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import Table, { TR, TD } from '../components/ui/Table'
import LoadingBar, { EmptyState } from '../components/ui/LoadingBar'
import RuleModal from '../components/rules/RuleModal'

const RULE_TYPES = ['banned_term','preferred_term','fact','slogan','approved_claim','guideline']

export default function KnowledgeHubPage() {
  const { profile } = useAuth()
  const [rules, setRules]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)  // null | { mode: 'add'|'edit', rule?: {} }
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  async function loadRules() {
    setLoading(true)
    const { data, error } = await supabase
      .from('brand_rules')
      .select('*')
      .order('rule_key')
      .order('created_at', { ascending: false })
    if (!error) setRules(data)
    setLoading(false)
  }

  useEffect(() => { loadRules() }, [])

  // For each rule_key, mark only the latest row as "latest version"
  const latestByKey = {}
  rules.forEach(r => {
    if (!latestByKey[r.rule_key]) latestByKey[r.rule_key] = r.id
  })

  // Filter
  const filtered = rules.filter(r => {
    if (filterType !== 'all' && r.type !== filterType) return false
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    return true
  })

  async function handleApprove(rule) {
    const { error } = await supabase
      .from('brand_rules')
      .update({ status: 'approved', approved_by: profile.id })
      .eq('id', rule.id)
    if (!error) loadRules()
  }

  async function handleArchive(rule) {
    const { error } = await supabase
      .from('brand_rules')
      .update({ status: 'archived' })
      .eq('id', rule.id)
    if (!error) loadRules()
  }

  return (
    <AppLayout>
      {loading && <LoadingBar />}
      <PageHeader
        title="Knowledge Hub"
        action={
          <Button onClick={() => setModal({ mode: 'add' })}>+ Add Rule</Button>
        }
      />

      {/* Filters */}
      <div className="flex gap-4 px-8 py-4 border-b border-border">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-surface border border-border text-sm text-fg px-3 py-1.5 focus:outline-none focus:border-accent"
        >
          <option value="all">All types</option>
          {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-surface border border-border text-sm text-fg px-3 py-1.5 focus:outline-none focus:border-accent"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Rules table */}
      <div className="px-8 py-6">
        {filtered.length === 0 && !loading ? (
          <EmptyState
            message="No rules found."
            action={<Button onClick={() => setModal({ mode: 'add' })}>Add the first rule</Button>}
          />
        ) : (
          <Table headers={['Title', 'Type', 'Status', 'Keywords', 'Value', 'Effective', 'Actions']}>
            {filtered.map(rule => {
              const isLatest = latestByKey[rule.rule_key] === rule.id
              return (
                <TR key={rule.id}>
                  <TD>
                    <div className="font-medium text-fg">{rule.title}</div>
                    <div className="font-mono text-[10px] text-muted mt-0.5">{rule.rule_key}</div>
                  </TD>
                  <TD mono>{rule.type}</TD>
                  <TD><StatusBadge status={rule.status} /></TD>
                  <TD className="max-w-[200px]">
                    <span className="text-muted text-xs">
                      {rule.keywords?.length > 0
                        ? rule.keywords.join(', ')
                        : <span className="italic">none</span>}
                    </span>
                  </TD>
                  <TD className="text-muted text-sm">{rule.value || '—'}</TD>
                  <TD mono className="text-muted text-xs whitespace-nowrap">
                    {new Date(rule.effective_from).toLocaleDateString('en-IN')}
                  </TD>
                  <TD>
                    <div className="flex gap-2 flex-wrap">
                      {/* Approve: only for draft rules */}
                      {rule.status === 'draft' && isLatest && (
                        <Button size="sm" onClick={() => handleApprove(rule)}>Approve</Button>
                      )}
                      {/* Edit-as-new-version: only for approved rules */}
                      {rule.status === 'approved' && isLatest && (
                        <Button size="sm" variant="secondary"
                          onClick={() => setModal({ mode: 'edit', rule })}>
                          New Version
                        </Button>
                      )}
                      {/* Archive: approved or draft */}
                      {(rule.status === 'approved' || rule.status === 'draft') && isLatest && (
                        <Button size="sm" variant="danger" onClick={() => handleArchive(rule)}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              )
            })}
          </Table>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal && (
        <RuleModal
          mode={modal.mode}
          existingRule={modal.rule}
          profile={profile}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadRules() }}
        />
      )}
    </AppLayout>
  )
}
