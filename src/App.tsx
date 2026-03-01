import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LiveOps } from './components/LiveOps'

type TabKey = 'overview' | 'live-ops' | 'pipeline' | 'agents' | 'crons'

type StatusData = {
  gateway: boolean
  whatsapp: boolean
  ollama: boolean
  checkedAt?: string
}

type RevenuePayment = {
  amount: number
  businessName: string
  timestamp: string
}

type RevenueData = {
  today: number
  week: number
  month: number
  payments: RevenuePayment[]
  totalCount: number
}

type Lead = {
  name: string
  email: string
  source: string
  createdAt: string | null
}

type LeadsData = {
  leads: Lead[]
  count: number
}

type AuditResult = {
  id: string
  businessName: string
  score: number
  timestamp: string
}

type AuditsData = {
  total: number
  today: number
  recent: AuditResult[]
}

type CronJob = {
  id: string
  name: string
  enabled: boolean
  status: 'ok' | 'error' | 'running' | 'idle' | 'disabled'
  lastRunAt: string | null
  nextRunAt: string | null
  lastError: string | null
}

type CronsData = {
  jobs: CronJob[]
  count: number
  source: 'cli' | 'file'
}

type Agent = {
  id: string
  name: string
  model: string
  status: 'active' | 'scheduled' | 'idle'
  cronJobs: number
  currentTask: string
  lastRunAt: string | null
  nextRunAt: string | null
  models: string[]
  workspaces: string[]
}

type AgentsData = {
  agents: Agent[]
  count: number
  checkedAt?: string
}

type SystemData = {
  cpu: {
    usedPercent: number
    loadAvg: number[]
    cores: number
  }
  memory: {
    usedPercent: number
    usedGb: number
    totalGb: number
  }
  disk: {
    usedPercent: number
    usedGb: number
    totalGb: number
  }
  uptime: {
    seconds: number
    text: string
  }
  activeSessions: number
  draftsPending: number
}

type ActivityEvent = {
  source: string
  timestamp: string | null
  line: string
}

type ActivityData = {
  events: ActivityEvent[]
  count: number
}

const tabs: Array<{ key: TabKey; label: string; eyebrow: string }> = [
  { key: 'overview', label: 'Overview', eyebrow: 'Command' },
  { key: 'live-ops', label: 'Live Ops', eyebrow: 'Realtime' },
  { key: 'pipeline', label: 'Pipeline', eyebrow: 'Revenue' },
  { key: 'agents', label: 'Agents', eyebrow: 'Fleet' },
  { key: 'crons', label: 'Crons', eyebrow: 'Schedulers' }
]

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed for ${url}`)
  }

  return response.json() as Promise<T>
}

const currency = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)

const shortDate = (value: string | null | undefined): string => {
  if (!value) return 'No data'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No data'

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

const relativeTime = (value: string | null | undefined): string => {
  if (!value) return 'Never'

  const parsed = new Date(value).getTime()
  if (Number.isNaN(parsed)) return 'Never'

  const delta = Date.now() - parsed
  const minutes = Math.max(0, Math.floor(delta / 60000))

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const statusDotClass = (value: boolean): string => (value ? 'bg-emerald-400 live-dot' : 'bg-rose-500')

const cronBadgeTone = (value: CronJob['status']): string => {
  if (value === 'ok') return 'badge-success'
  if (value === 'running') return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  if (value === 'idle') return 'badge-info'
  if (value === 'disabled') return 'badge-neutral'
  return 'badge-danger'
}

function SectionCard({
  title,
  meta,
  children,
  className = ''
}: {
  title: string
  meta?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-[11px] font-semibold uppercase tracking-[0.26em] text-transparent">
            {title}
          </p>
        </div>
        {meta ? <span className="font-mono text-[11px] text-white/45">{meta}</span> : null}
      </div>
      {children}
    </section>
  )
}

function StatPill({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-3xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur-xl">
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs text-white/45">{detail}</p> : null}
    </div>
  )
}

function MetricLine({
  label,
  value,
  tone = 'blue'
}: {
  label: string
  value: string
  tone?: 'blue' | 'green' | 'yellow' | 'red'
}) {
  const toneClass =
    tone === 'green'
      ? 'from-emerald-400/25 to-emerald-400/0 text-emerald-200'
      : tone === 'yellow'
        ? 'from-amber-400/25 to-amber-400/0 text-amber-200'
        : tone === 'red'
          ? 'from-rose-400/25 to-rose-400/0 text-rose-200'
          : 'from-indigo-400/25 to-indigo-400/0 text-indigo-100'

  return (
    <div className={`rounded-2xl border border-white/5 bg-gradient-to-r ${toneClass} px-4 py-3`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.16em] text-white/45">{label}</span>
        <span className="font-mono text-sm font-medium">{value}</span>
      </div>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusData>({ gateway: false, whatsapp: false, ollama: false })
  const [revenue, setRevenue] = useState<RevenueData>({ today: 0, week: 0, month: 0, payments: [], totalCount: 0 })
  const [leads, setLeads] = useState<LeadsData>({ leads: [], count: 0 })
  const [audits, setAudits] = useState<AuditsData>({ total: 0, today: 0, recent: [] })
  const [crons, setCrons] = useState<CronsData>({ jobs: [], count: 0, source: 'file' })
  const [agents, setAgents] = useState<AgentsData>({ agents: [], count: 0 })
  const [system, setSystem] = useState<SystemData>({
    cpu: { usedPercent: 0, loadAvg: [0, 0, 0], cores: 0 },
    memory: { usedPercent: 0, usedGb: 0, totalGb: 0 },
    disk: { usedPercent: 0, usedGb: 0, totalGb: 0 },
    uptime: { seconds: 0, text: '0m' },
    activeSessions: 0,
    draftsPending: 0
  })
  const [activity, setActivity] = useState<ActivityData>({ events: [], count: 0 })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [nextStatus, nextRevenue, nextLeads, nextAudits, nextCrons, nextAgents, nextSystem, nextActivity] = await Promise.all([
          fetchJson<StatusData>('/api/status'),
          fetchJson<RevenueData>('/api/revenue'),
          fetchJson<LeadsData>('/api/leads'),
          fetchJson<AuditsData>('/api/audits'),
          fetchJson<CronsData>('/api/crons'),
          fetchJson<AgentsData>('/api/agents'),
          fetchJson<SystemData>('/api/system'),
          fetchJson<ActivityData>('/api/activity')
        ])

        if (cancelled) return

        setStatus(nextStatus)
        setRevenue(nextRevenue)
        setLeads(nextLeads)
        setAudits(nextAudits)
        setCrons(nextCrons)
        setAgents(nextAgents)
        setSystem(nextSystem)
        setActivity(nextActivity)
        setError(null)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    const poller = window.setInterval(() => void load(), 30000)

    return () => {
      cancelled = true
      window.clearInterval(poller)
    }
  }, [])

  const liveTime = now.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  })

  const statusSummary = useMemo(
    () => [
      { label: 'Gateway', online: status.gateway },
      { label: 'WhatsApp', online: status.whatsapp },
      { label: 'Ollama', online: status.ollama }
    ],
    [status]
  )

  const runningCrons = crons.jobs.filter((job) => job.status === 'running').length
  const healthyServices = statusSummary.filter((item) => item.online).length
  const activeAgents = agents.agents.filter((agent) => agent.status === 'active').length

  const overviewContent = (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Revenue Lens" meta={`${revenue.totalCount} payments`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatPill label="Today" value={currency(revenue.today)} />
            <StatPill label="Week" value={currency(revenue.week)} />
            <StatPill label="Month" value={currency(revenue.month)} />
          </div>
          <div className="mt-4 space-y-2">
            {revenue.payments.slice(0, 4).map((payment) => (
              <div key={`${payment.businessName}-${payment.timestamp}`} className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{payment.businessName}</p>
                    <p className="mt-1 text-xs text-white/45">{shortDate(payment.timestamp)}</p>
                  </div>
                  <span className="font-mono text-sm text-white">{currency(payment.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Pipeline Snapshot" meta={`${leads.count} captured`}>
          <div className="space-y-2">
            {leads.leads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/45">
                No recent lead captures.
              </div>
            ) : (
              leads.leads.slice(0, 5).map((lead, index) => (
                <div key={`${lead.email}-${index}`} className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm text-white">{lead.name}</p>
                    <span className="rounded-full border border-white/5 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-white/50">
                      {lead.source}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-white/55">{lead.email || 'No email available'}</p>
                  <p className="mt-2 text-[11px] text-white/40">{relativeTime(lead.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Audit Output" meta={`${audits.total} total`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatPill label="Today" value={String(audits.today)} />
            <StatPill label="All Time" value={String(audits.total)} />
          </div>
          <div className="mt-4 space-y-2">
            {audits.recent.map((audit) => (
              <div key={audit.id} className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{audit.businessName}</p>
                  <p className="mt-1 text-[11px] text-white/40">{shortDate(audit.timestamp)}</p>
                </div>
                <span className="rounded-xl border border-indigo-400/15 bg-indigo-400/10 px-3 py-2 font-mono text-sm text-white">
                  {audit.score}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="System Telemetry" meta={`Uptime ${system.uptime.text}`}>
          <div className="space-y-3">
            <MetricLine label="CPU" value={`${system.cpu.usedPercent}% of ${system.cpu.cores} cores`} tone="blue" />
            <MetricLine label="Memory" value={`${system.memory.usedGb}GB / ${system.memory.totalGb}GB`} tone="green" />
            <MetricLine label="Disk" value={`${system.disk.usedGb}GB / ${system.disk.totalGb}GB`} tone="yellow" />
            <MetricLine label="Drafts Pending" value={String(system.draftsPending)} tone="red" />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Command Feed" meta={`${activity.count} events`}>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {statusSummary.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.16em] text-white/45">{item.label}</span>
                <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(item.online)}`} />
              </div>
              <p className="mt-3 font-mono text-sm text-white">{item.online ? 'ONLINE' : 'OFFLINE'}</p>
            </div>
          ))}
        </div>
        <div className="max-h-[540px] overflow-y-auto rounded-3xl border border-white/5 bg-black/20 custom-scroll">
          {activity.events.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-white/45">No recent activity detected.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {activity.events.map((event, index) => (
                <div key={`${event.source}-${event.timestamp}-${index}`} className="activity-row flex flex-col gap-2 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{event.line}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/35">{event.source}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-white/45">{shortDate(event.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )

  const pipelineContent = (
    <div className="grid gap-4 xl:grid-cols-3">
      <SectionCard title="Revenue Queue" meta="Recent collections">
        <div className="space-y-3">
          {revenue.payments.map((payment) => (
            <div key={`${payment.businessName}-${payment.timestamp}`} className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">{payment.businessName}</p>
                  <p className="mt-1 text-xs text-white/45">{shortDate(payment.timestamp)}</p>
                </div>
                <span className="font-mono text-sm text-white">{currency(payment.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Lead Intake" meta={`${leads.count} total`}>
        <div className="space-y-3">
          {leads.leads.slice(0, 8).map((lead, index) => (
            <div key={`${lead.email}-${index}`} className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <p className="text-sm text-white">{lead.name}</p>
              <p className="mt-1 text-xs text-white/55">{lead.email || 'No email available'}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="badge badge-info">{lead.source}</span>
                <span className="font-mono text-[11px] text-white/45">{relativeTime(lead.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Audit Queue" meta="Last 5">
        <div className="space-y-3">
          {audits.recent.map((audit) => (
            <div key={audit.id} className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{audit.businessName}</p>
                  <p className="mt-1 text-xs text-white/45">{shortDate(audit.timestamp)}</p>
                </div>
                <span className="rounded-xl border border-white/5 bg-white/[0.04] px-3 py-1.5 font-mono text-sm text-white">
                  {audit.score}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )

  const agentsContent = (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Fleet Health" meta={`${activeAgents}/${agents.count || 0} active`}>
          <div className="grid gap-3 md:grid-cols-3">
            {statusSummary.map((item) => (
              <div key={item.label} className="rounded-3xl border border-white/5 bg-white/[0.03] px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">{item.label}</p>
                  <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(item.online)}`} />
                </div>
                <p className="mt-4 text-lg font-medium text-white">{item.online ? 'Healthy' : 'Attention'}</p>
                <p className="mt-1 text-xs text-white/45">{item.online ? 'Responding to checks' : 'Not responding to checks'}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <StatPill label="Active Sessions" value={String(system.activeSessions)} detail="OpenClaw runtime" />
            <StatPill label="Drafts Pending" value={String(system.draftsPending)} detail="Awaiting review" />
          </div>
        </SectionCard>

        <SectionCard title="Runtime Envelope" meta={loading ? 'Syncing' : liveTime}>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/45">
                <span>Memory</span>
                <span className="font-mono text-white">{system.memory.usedPercent}%</span>
              </div>
              <div className="progress-bar h-2">
                <div className="progress-fill" style={{ width: `${system.memory.usedPercent}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/45">
                <span>Disk</span>
                <span className="font-mono text-white">{system.disk.usedPercent}%</span>
              </div>
              <div className="progress-bar h-2">
                <div className="progress-fill" style={{ width: `${system.disk.usedPercent}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/45">
                <span>CPU</span>
                <span className="font-mono text-white">{system.cpu.usedPercent}%</span>
              </div>
              <div className="progress-bar h-2">
                <div className="progress-fill" style={{ width: `${system.cpu.usedPercent}%` }} />
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Load Average</p>
              <p className="mt-2 font-mono text-xl text-white">{system.cpu.loadAvg.join(' / ')}</p>
              <p className="mt-1 text-xs text-white/45">{system.cpu.cores} logical cores</p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Agent Roster" meta={`${agents.count} detected`}>
        {agents.agents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/45">
            No agents detected in the OpenClaw workspace.
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-3">
            {agents.agents.map((agent) => (
              <div key={agent.id} className="rounded-3xl border border-white/5 bg-white/[0.03] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{agent.name}</p>
                    <p className="mt-1 text-xs text-white/45">{agent.workspaces.join(' • ')}</p>
                  </div>
                  <span
                    className={`badge ${
                      agent.status === 'active'
                        ? 'badge-success'
                        : agent.status === 'scheduled'
                          ? 'badge-info'
                          : 'badge-neutral'
                    }`}
                  >
                    {agent.status}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="badge badge-neutral">{agent.model}</span>
                  <span className="badge badge-neutral">{agent.cronJobs} cron{agent.cronJobs === 1 ? '' : 's'}</span>
                </div>
                <p className="mt-4 text-sm text-white">{agent.currentTask}</p>
                <div className="mt-4 space-y-1 text-[11px] uppercase tracking-[0.14em] text-white/35">
                  <p>Last {relativeTime(agent.lastRunAt)}</p>
                  <p>Next {relativeTime(agent.nextRunAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )

  const cronsContent = (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <SectionCard title="Cron Matrix" meta={`${crons.count} jobs · ${crons.source}`}>
        <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1 custom-scroll">
          {crons.jobs.map((job) => (
            <div key={job.id} className="rounded-3xl border border-white/5 bg-white/[0.03] px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        job.status === 'ok'
                          ? 'bg-emerald-400'
                          : job.status === 'running'
                            ? 'bg-amber-400 live-dot'
                            : job.status === 'idle'
                              ? 'bg-sky-400'
                              : job.status === 'disabled'
                                ? 'bg-white/30'
                                : 'bg-rose-500'
                      }`}
                    />
                    <p className="truncate text-sm font-medium text-white">{job.name}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-white/35">
                    <span>Last {relativeTime(job.lastRunAt)}</span>
                    <span>Next {relativeTime(job.nextRunAt)}</span>
                  </div>
                  {job.lastError ? <p className="mt-3 text-xs text-rose-200">{job.lastError}</p> : null}
                </div>
                <span className={`badge ${cronBadgeTone(job.status)}`}>{job.status}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Scheduler Summary" meta="Derived">
        <div className="grid gap-3">
          <StatPill label="Running" value={String(runningCrons)} detail="Live executions" />
          <StatPill label="Healthy" value={String(crons.jobs.filter((job) => job.status === 'ok').length)} detail="Successful last run" />
          <StatPill label="Attention" value={String(crons.jobs.filter((job) => job.status === 'error').length)} detail="Needs review" />
        </div>
        <div className="mt-4 rounded-3xl border border-white/5 bg-black/20 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Latest Activity</p>
          <div className="mt-3 space-y-3">
            {activity.events.slice(-4).reverse().map((event, index) => (
              <div key={`${event.source}-${event.timestamp}-${index}`} className="border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                <p className="text-sm text-white">{event.line}</p>
                <p className="mt-1 font-mono text-[11px] text-white/40">{shortDate(event.timestamp)}</p>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  )

  const tabContent =
    activeTab === 'overview'
      ? overviewContent
      : activeTab === 'live-ops'
        ? <LiveOps />
        : activeTab === 'pipeline'
          ? pipelineContent
          : activeTab === 'agents'
            ? agentsContent
            : cronsContent

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="mx-auto min-h-screen max-w-[1720px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="panel h-fit xl:sticky xl:top-4">
            <div className="flex items-center gap-3">
              <span className="live-dot bg-emerald-400 shadow-[0_0_20px_rgba(34,197,94,0.45)]" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Ops Center</p>
                <h1 className="mt-1 bg-gradient-to-r from-indigo-300 via-indigo-100 to-violet-300 bg-clip-text text-2xl font-semibold tracking-[0.08em] text-transparent">
                  MISSION CONTROL
                </h1>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-white/5 bg-black/20 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Live Clock</p>
              <p className="mt-3 font-mono text-lg text-white">{liveTime}</p>
              <p className="mt-2 text-xs text-white/45">Operational overview of agents, revenue, pipeline, and cron health.</p>
            </div>

            <nav className="mt-6 space-y-2">
              {tabs.map((tab) => {
                const active = tab.key === activeTab
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                      active
                        ? 'border-indigo-400/20 bg-gradient-to-r from-indigo-500/18 to-violet-500/12 shadow-[0_0_28px_rgba(99,102,241,0.12)]'
                        : 'border-white/5 bg-white/[0.025] hover:border-white/10 hover:bg-white/[0.04]'
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">{tab.eyebrow}</p>
                    <p className="mt-1 font-medium text-white">{tab.label}</p>
                  </button>
                )
              })}
            </nav>
          </aside>

          <div className="min-w-0">
            <header className="panel">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="live-dot bg-emerald-400 shadow-[0_0_20px_rgba(34,197,94,0.45)]" />
                    <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Realtime command stream</p>
                  </div>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Premium ops visibility, built for always-on automation.
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm text-white/55">
                    Dark glass surfaces, realtime telemetry, and tabbed command views for revenue, agents, pipeline, and cron orchestration.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {statusSummary.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(item.online)}`} />
                        <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">{item.label}</span>
                      </div>
                      <p className="mt-2 font-mono text-sm text-white">{item.online ? 'ACTIVE' : 'DOWN'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </header>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <section className="panel mt-4">
              <div className="grid gap-3 lg:grid-cols-5">
                <StatPill label="Revenue Today" value={currency(revenue.today)} detail={loading ? 'Syncing...' : 'Gross collected'} />
                <StatPill label="Leads" value={String(leads.count)} detail="Captured contacts" />
                <StatPill label="Audits Today" value={String(audits.today)} detail="New evaluations" />
                <StatPill label="Agents" value={String(agents.count)} detail={`${activeAgents} active`} />
                <StatPill label="Crons Running" value={String(runningCrons)} detail={`${crons.count} scheduled`} />
              </div>
            </section>

            <section className="mt-4">{tabContent}</section>
          </div>
        </div>
      </div>
    </main>
  )
}

export default App
