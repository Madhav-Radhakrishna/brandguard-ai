// pages/InsightsPage.jsx – Stage 7: Analytics dashboard (manager only)
// Stat cards, charts (recharts), filters: date range, category, severity.
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import AppLayout from '../components/layout/AppLayout'
import PageHeader from '../components/layout/PageHeader'
import LoadingBar, { EmptyState } from '../components/ui/LoadingBar'
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts'

// ── Design tokens ──────────────────────────────────────────────────────────────
const ACCENT  = '#ef4444'
const ORANGE  = '#f97316'
const GREEN   = '#22c55e'
const BLUE    = '#3b82f6'
const PURPLE  = '#a855f7'
const MUTED   = '#6b7280'
const GRID    = '#2a2a2a'

const SEV_COLORS = { high: ACCENT, medium: ORANGE, low: GREEN }
const CAT_COLORS = {
  terminology: ACCENT,
  fact:        ORANGE,
  claim:       BLUE,
  tone:        PURPLE,
  other:       MUTED,
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div className="bg-surface border border-border rounded p-5">
      <p className="text-xs font-mono uppercase tracking-widest text-muted mb-2">{label}</p>
      <p className="text-3xl font-semibold text-fg font-mono">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded p-5">
      <p className="text-sm font-medium text-fg mb-5">{title}</p>
      {children}
    </div>
  )
}

const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a1a1a] border border-border px-3 py-2 text-xs text-fg rounded shadow-lg">
      {label && <p className="text-muted mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill || '#fff' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

function FilterSelect({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-surface border border-border text-xs font-mono text-fg px-3 py-1.5 focus:outline-none focus:border-accent"
    >
      {children}
    </select>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getLast14Days() {
  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const [loading,     setLoading]     = useState(true)
  const [submissions, setSubmissions] = useState([])
  const [findings,    setFindings]    = useState([])

  // ── Filters ────────────────────────────────────────────────────────────────
  const [dateRange,     setDateRange]     = useState('30')   // days: '7','14','30','90','all'
  const [filterCat,     setFilterCat]     = useState('all')  // finding category
  const [filterSev,     setFilterSev]     = useState('all')  // finding severity
  const [filterStatus,  setFilterStatus]  = useState('all')  // submission status

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [subRes, findRes] = await Promise.all([
        supabase
          .from('submissions')
          .select('id, status, created_at, source, version')
          .order('created_at', { ascending: false }),
        supabase
          .from('findings')
          .select('id, category, severity, source, submission_id, rule_id, review_status, employee_action, created_at, brand_rules(title, rule_key)')
          .order('created_at', { ascending: false }),
      ])
      setSubmissions(subRes.data || [])
      setFindings(findRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Apply filters ──────────────────────────────────────────────────────────
  const cutoff = dateRange === 'all' ? null : daysAgo(Number(dateRange))

  const filteredSubs = useMemo(() =>
    submissions.filter(s => {
      if (cutoff && new Date(s.created_at) < cutoff) return false
      if (filterStatus !== 'all' && s.status !== filterStatus) return false
      return true
    }), [submissions, cutoff, filterStatus])

  const filteredFindings = useMemo(() => {
    const subIds = new Set(filteredSubs.map(s => s.id))
    return findings.filter(f => {
      if (!subIds.has(f.submission_id)) return false
      if (filterCat !== 'all' && f.category !== filterCat) return false
      if (filterSev !== 'all' && f.severity !== filterSev) return false
      return true
    })
  }, [findings, filteredSubs, filterCat, filterSev])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const total       = filteredSubs.length
  const approved    = filteredSubs.filter(s => s.status === 'approved').length
  const approvalPct = total > 0 ? Math.round((approved / total) * 100) : 0
  const avgFindings = total > 0 ? (filteredFindings.length / total).toFixed(1) : '0'

  // Category chart
  const catCounts  = filteredFindings.reduce((a, f) => { a[f.category] = (a[f.category]||0)+1; return a }, {})
  const catData    = Object.entries(catCounts).map(([name, value]) => ({ name, value, fill: CAT_COLORS[name] || MUTED }))

  // Severity donut
  const sevCounts  = filteredFindings.reduce((a, f) => { a[f.severity] = (a[f.severity]||0)+1; return a }, {})
  const sevData    = Object.entries(sevCounts).map(([name, value]) => ({ name, value, fill: SEV_COLORS[name] || MUTED }))

  // Trend (last 14 days or filtered range)
  const trendDays  = getLast14Days()
  const subByDay   = filteredSubs.reduce((a, s) => { const d = s.created_at.slice(0,10); a[d]=(a[d]||0)+1; return a }, {})
  const trendData  = trendDays.map(d => ({ date: d.slice(5), count: subByDay[d] || 0 }))

  // Top violated rules
  const ruleCounts = {}
  filteredFindings.forEach(f => {
    if (!f.rule_id) return
    if (!ruleCounts[f.rule_id]) {
      ruleCounts[f.rule_id] = { title: f.brand_rules?.title || 'Unknown', rule_key: f.brand_rules?.rule_key || '—', count: 0 }
    }
    ruleCounts[f.rule_id].count++
  })
  const topRules = Object.values(ruleCounts).sort((a, b) => b.count - a.count).slice(0, 5)

  // Source & status breakdown
  const srcCounts = filteredSubs.reduce((a, s) => { a[s.source]=(a[s.source]||0)+1; return a }, {})
  const statusMap = filteredSubs.reduce((a, s) => { a[s.status]=(a[s.status]||0)+1; return a }, {})

  const hasData = submissions.length > 0

  return (
    <AppLayout>
      {loading && <LoadingBar />}
      <PageHeader title="Insights" />

      {/* ── FILTER BAR ── */}
      <div className="flex flex-wrap gap-3 px-8 py-4 border-b border-border bg-[#141414] items-center">
        <span className="text-xs font-mono uppercase tracking-widest text-muted mr-1">Filters</span>

        <FilterSelect value={dateRange} onChange={setDateRange}>
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </FilterSelect>

        <FilterSelect value={filterStatus} onChange={setFilterStatus}>
          <option value="all">All statuses</option>
          <option value="pending_review">Pending Review</option>
          <option value="needs_changes">Needs Changes</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </FilterSelect>

        <FilterSelect value={filterCat} onChange={setFilterCat}>
          <option value="all">All categories</option>
          <option value="terminology">Terminology</option>
          <option value="fact">Fact</option>
          <option value="claim">Claim</option>
          <option value="tone">Tone</option>
          <option value="other">Other</option>
        </FilterSelect>

        <FilterSelect value={filterSev} onChange={setFilterSev}>
          <option value="all">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </FilterSelect>

        {/* Reset */}
        {(dateRange !== '30' || filterStatus !== 'all' || filterCat !== 'all' || filterSev !== 'all') && (
          <button
            onClick={() => { setDateRange('30'); setFilterStatus('all'); setFilterCat('all'); setFilterSev('all') }}
            className="text-xs font-mono text-muted hover:text-accent transition-colors ml-auto"
          >
            Reset filters
          </button>
        )}

        <span className="text-xs font-mono text-muted ml-auto">
          {total} sub · {filteredFindings.length} findings
        </span>
      </div>

      {!loading && !hasData ? (
        <EmptyState message="No submissions yet. Insights appear once employees submit content." />
      ) : (
        <div className="px-8 py-6 space-y-8">

          {/* ── STAT CARDS ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Submissions"       value={total} />
            <StatCard label="Findings"          value={filteredFindings.length} />
            <StatCard label="Approval Rate"     value={`${approvalPct}%`} sub={`${approved} of ${total} approved`} />
            <StatCard label="Avg Findings / Sub" value={avgFindings} />
          </div>

          {/* ── CHARTS ROW ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            <ChartCard title="Findings by Category">
              {catData.length === 0
                ? <p className="text-muted text-sm">No findings in this filter.</p>
                : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={catData} barCategoryGap="30%">
                      <CartesianGrid vertical={false} stroke={GRID} />
                      <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<DarkTooltip />} cursor={{ fill: '#ffffff0a' }} />
                      <Bar dataKey="value" name="Findings" radius={[3,3,0,0]}>
                        {catData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
            </ChartCard>

            <ChartCard title="Findings by Severity">
              {sevData.length === 0
                ? <p className="text-muted text-sm">No findings in this filter.</p>
                : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={sevData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}
                      >
                        {sevData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip content={<DarkTooltip />} />
                      <Legend iconType="circle" wrapperStyle={{ color: MUTED, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
            </ChartCard>
          </div>

          {/* ── TREND ── */}
          <ChartCard title="Submissions — Last 14 Days">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid stroke={GRID} />
                <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<DarkTooltip />} />
                <Line type="monotone" dataKey="count" name="Submissions" stroke={ACCENT} strokeWidth={2} dot={{ r: 3, fill: ACCENT }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ── BOTTOM ROW ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

            {/* Top violated rules */}
            <div className="lg:col-span-2 bg-surface border border-border rounded p-5">
              <p className="text-sm font-medium text-fg mb-4">Top Violated Rules</p>
              {topRules.length === 0
                ? <p className="text-muted text-sm">No rule-linked findings in this filter.</p>
                : (
                  <div className="divide-y divide-border">
                    {topRules.map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm text-fg">{r.title}</p>
                          <p className="text-xs font-mono text-muted">{r.rule_key}</p>
                        </div>
                        <span className="text-sm font-mono font-semibold text-accent ml-4 flex-shrink-0">
                          {r.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Source + Status breakdown */}
            <div className="flex flex-col gap-4">
              <div className="bg-surface border border-border rounded p-5">
                <p className="text-sm font-medium text-fg mb-3">Submission Sources</p>
                <div className="space-y-2">
                  {['typed','docx','pdf'].map(src => (
                    <div key={src} className="flex justify-between items-center">
                      <span className="text-xs font-mono uppercase text-muted">{src}</span>
                      <span className="text-xs font-mono text-fg">{srcCounts[src] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-surface border border-border rounded p-5">
                <p className="text-sm font-medium text-fg mb-3">By Status</p>
                <div className="space-y-2">
                  {['pending_review','needs_changes','approved','rejected'].map(st => (
                    <div key={st} className="flex justify-between items-center">
                      <span className="text-xs font-mono text-muted">{st.replace('_',' ')}</span>
                      <span className="text-xs font-mono text-fg">{statusMap[st] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </AppLayout>
  )
}
