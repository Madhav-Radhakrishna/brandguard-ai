// pages/InsightsPage.jsx – Stage 7: Analytics dashboard (manager only)
// Shows submission stats, finding breakdowns, trends, and top violated rules.
import { useState, useEffect } from 'react'
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

const ACCENT   = '#ef4444'
const ORANGE   = '#f97316'
const GREEN    = '#22c55e'
const BLUE     = '#3b82f6'
const PURPLE   = '#a855f7'
const MUTED    = '#6b7280'
const GRID     = '#2a2a2a'

const SEV_COLORS = { high: ACCENT, medium: ORANGE, low: GREEN }
const CAT_COLORS = {
  terminology: ACCENT,
  fact:        ORANGE,
  claim:       BLUE,
  tone:        PURPLE,
  other:       MUTED,
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div className="bg-surface border border-border rounded p-5">
      <p className="text-xs font-mono uppercase tracking-widest text-muted mb-2">{label}</p>
      <p className="text-3xl font-semibold text-fg font-mono">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  )
}

// ── Chart wrapper ─────────────────────────────────────────────────────────────
function ChartCard({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded p-5">
      <p className="text-sm font-medium text-fg mb-5">{title}</p>
      {children}
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLast14Days() {
  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

export default function InsightsPage() {
  const [loading,     setLoading]     = useState(true)
  const [submissions, setSubmissions] = useState([])
  const [findings,    setFindings]    = useState([])

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
          .select('id, category, severity, source, submission_id, rule_id, review_status, employee_action, brand_rules(title, rule_key)')
          .order('created_at', { ascending: false }),
      ])
      setSubmissions(subRes.data || [])
      setFindings(findRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <AppLayout>
        <LoadingBar />
        <PageHeader title="Insights" />
      </AppLayout>
    )
  }

  if (submissions.length === 0) {
    return (
      <AppLayout>
        <PageHeader title="Insights" />
        <EmptyState message="No submissions yet. Insights will appear once employees submit content for review." />
      </AppLayout>
    )
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const total       = submissions.length
  const approved    = submissions.filter(s => s.status === 'approved').length
  const approvalPct = total > 0 ? Math.round((approved / total) * 100) : 0
  const avgFindings = total > 0 ? (findings.length / total).toFixed(1) : '0'

  // Submissions by status
  const statusCounts = submissions.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1
    return acc
  }, {})
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }))

  // Findings by category
  const catCounts = findings.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1
    return acc
  }, {})
  const catData = Object.entries(catCounts).map(([name, value]) => ({ name, value, fill: CAT_COLORS[name] || MUTED }))

  // Findings by severity
  const sevCounts = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1
    return acc
  }, {})
  const sevData = Object.entries(sevCounts).map(([name, value]) => ({ name, value, fill: SEV_COLORS[name] || MUTED }))

  // Submissions over last 14 days
  const days = getLast14Days()
  const subByDay = submissions.reduce((acc, s) => {
    const day = s.created_at.slice(0, 10)
    acc[day] = (acc[day] || 0) + 1
    return acc
  }, {})
  const trendData = days.map(d => ({
    date: d.slice(5), // MM-DD
    count: subByDay[d] || 0,
  }))

  // Top violated rules
  const ruleCounts = {}
  findings.forEach(f => {
    if (!f.rule_id) return
    const key = f.rule_id
    if (!ruleCounts[key]) {
      ruleCounts[key] = {
        title:    f.brand_rules?.title || 'Unknown',
        rule_key: f.brand_rules?.rule_key || '—',
        count:    0,
      }
    }
    ruleCounts[key].count++
  })
  const topRules = Object.values(ruleCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Source breakdown
  const srcCounts = submissions.reduce((acc, s) => {
    acc[s.source] = (acc[s.source] || 0) + 1
    return acc
  }, {})

  return (
    <AppLayout>
      <PageHeader title="Insights" />

      <div className="px-8 py-6 space-y-8">

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Submissions" value={total} />
          <StatCard label="Total Findings"    value={findings.length} />
          <StatCard label="Approval Rate"     value={`${approvalPct}%`} sub={`${approved} of ${total} approved`} />
          <StatCard label="Avg Findings / Sub" value={avgFindings} />
        </div>

        {/* ── CHARTS ROW ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Findings by Category */}
          <ChartCard title="Findings by Category">
            {catData.length === 0 ? (
              <p className="text-muted text-sm">No findings yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catData} barCategoryGap="30%">
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: '#ffffff0a' }} />
                  <Bar dataKey="value" name="Findings" radius={[3, 3, 0, 0]}>
                    {catData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Findings by Severity */}
          <ChartCard title="Findings by Severity">
            {sevData.length === 0 ? (
              <p className="text-muted text-sm">No findings yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={sevData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {sevData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<DarkTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ color: MUTED, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* ── TREND: Submissions over 14 days ── */}
        <ChartCard title="Submissions — Last 14 Days">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid stroke={GRID} />
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<DarkTooltip />} />
              <Line
                type="monotone"
                dataKey="count"
                name="Submissions"
                stroke={ACCENT}
                strokeWidth={2}
                dot={{ r: 3, fill: ACCENT }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── BOTTOM ROW: Top Rules + Sources ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Top violated rules */}
          <div className="lg:col-span-2 bg-surface border border-border rounded p-5">
            <p className="text-sm font-medium text-fg mb-4">Top Violated Rules</p>
            {topRules.length === 0 ? (
              <p className="text-muted text-sm">No rule-linked findings yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {topRules.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm text-fg">{r.title}</p>
                      <p className="text-xs font-mono text-muted">{r.rule_key}</p>
                    </div>
                    <span className="text-sm font-mono font-semibold text-accent ml-4 flex-shrink-0">
                      {r.count} finding{r.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submission sources + Status breakdown */}
          <div className="flex flex-col gap-4">
            <div className="bg-surface border border-border rounded p-5">
              <p className="text-sm font-medium text-fg mb-3">Submission Sources</p>
              <div className="space-y-2">
                {['typed', 'docx', 'pdf'].map(src => (
                  <div key={src} className="flex justify-between items-center">
                    <span className="text-xs font-mono uppercase text-muted">{src}</span>
                    <span className="text-xs font-mono text-fg">{srcCounts[src] || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface border border-border rounded p-5">
              <p className="text-sm font-medium text-fg mb-3">Submission Status</p>
              <div className="space-y-2">
                {['pending_review', 'needs_changes', 'approved', 'rejected'].map(st => (
                  <div key={st} className="flex justify-between items-center">
                    <span className="text-xs font-mono text-muted">{st.replace('_', ' ')}</span>
                    <span className="text-xs font-mono text-fg">{statusCounts[st] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  )
}
