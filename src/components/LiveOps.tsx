import { useEffect, useMemo, useState } from 'react'

type CronJob = {
  id: string
  agentId?: string
  name: string
  status: 'ok' | 'error' | 'running' | 'idle' | 'disabled'
  lastRunAt: string | null
  nextRunAt: string | null
  lastDurationMs?: number | null
  lastError?: string | null
}

type CronStatusPayload = {
  jobs: CronJob[]
  count: number
  checkedAt?: string
}

type Agent = {
  id: string
  agentId: string
  name: string
  role: string
  model: string
  uptimeHours: number
  status: 'active' | 'idle'
  sessions: number
  currentTask: string
  lastRunAt: string | null
  nextRunAt: string | null
  queueDepth: number
  progress: number
  lastStatus: 'ok' | 'error' | 'running' | 'idle' | 'disabled'
}

type AgentsPayload = {
  agents: Agent[]
  count: number
  checkedAt?: string
}

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed for ${url}`)
  }

  return response.json() as Promise<T>
}

const shortDate = (value: string | null | undefined): string => {
  if (!value) return 'No data'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No data'

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  })
}

const relativeTime = (value: string | null | undefined): string => {
  if (!value) return 'Never'
  const parsed = new Date(value).getTime()
  if (Number.isNaN(parsed)) return 'Never'

  const delta = Math.max(0, Date.now() - parsed)
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const toneClass = (status: Agent['lastStatus']) => {
  if (status === 'ok') return 'badge-success'
  if (status === 'running') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  if (status === 'error') return 'badge-danger'
  if (status === 'idle') return 'badge-info'
  return 'badge-neutral'
}

export function LiveOps() {
  const [agents, setAgents] = useState<AgentsPayload>({ agents: [], count: 0 })
  const [cronStatus, setCronStatus] = useState<CronStatusPayload>({ jobs: [], count: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [nextAgents, nextCronStatus] = await Promise.all([
          fetchJson<AgentsPayload>('/api/agents'),
          fetchJson<CronStatusPayload>('/api/cron-status')
        ])

        if (cancelled) return

        setAgents(nextAgents)
        setCronStatus(nextCronStatus)
        setError(null)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load Live Ops')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    const poller = window.setInterval(() => void load(), 10000)

    return () => {
      cancelled = true
      window.clearInterval(poller)
    }
  }, [])

  const activityFeed = useMemo(() => {
    const fromCrons = cronStatus.jobs
      .filter((job) => job.lastRunAt || job.status === 'running')
      .map((job) => ({
        id: job.id,
        timestamp: job.lastRunAt ?? job.nextRunAt,
        label:
          job.status === 'running'
            ? `${job.name} is executing`
            : job.status === 'error'
              ? `${job.name} hit an error`
              : `${job.name} completed ${relativeTime(job.lastRunAt)}`,
        status: job.status
      }))

    const fromAgents = agents.agents.map((agent) => ({
      id: `agent-${agent.id}`,
      timestamp: agent.lastRunAt,
      label: `${agent.name}: ${agent.currentTask}`,
      status: agent.lastStatus
    }))

    return [...fromCrons, ...fromAgents]
      .sort((a, b) => Date.parse(b.timestamp ?? '') - Date.parse(a.timestamp ?? ''))
      .slice(0, 10)
  }, [agents.agents, cronStatus.jobs])

  const runningJobs = cronStatus.jobs.filter((job) => job.status === 'running').length
  const activeAgents = agents.agents.filter((agent) => agent.status === 'active').length

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <section className="panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-[11px] font-semibold uppercase tracking-[0.24em] text-transparent">
              Live Agent Activity
            </p>
            <p className="mt-2 text-sm text-white/55">
              Auto-refreshing every 10 seconds from `/api/agents` and `/api/cron-status`.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Agents Active</p>
              <p className="mt-2 font-mono text-xl text-white">{activeAgents}/{agents.count}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Jobs Running</p>
              <p className="mt-2 font-mono text-xl text-white">{runningJobs}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Last Sync</p>
              <p className="mt-2 font-mono text-sm text-white">
                {loading ? 'Syncing...' : shortDate(agents.checkedAt ?? cronStatus.checkedAt)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {agents.agents.map((agent) => (
            <article key={agent.id} className="panel">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          agent.status === 'active'
                            ? 'bg-emerald-400 live-dot shadow-[0_0_20px_rgba(34,197,94,0.35)]'
                            : 'bg-sky-400'
                        }`}
                      />
                      <h3 className="bg-gradient-to-r from-indigo-200 to-violet-200 bg-clip-text text-lg font-semibold text-transparent">
                        {agent.name}
                      </h3>
                    </div>
                    <p className="mt-2 text-sm text-white/45">{agent.role}</p>
                  </div>
                  <span className={`badge ${toneClass(agent.lastStatus)}`}>{agent.status}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="badge badge-neutral">{agent.model}</span>
                  <span className="badge badge-info">{agent.sessions} sessions</span>
                  <span className="badge badge-neutral">{agent.queueDepth} queued</span>
                </div>

                <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Current Task</p>
                  <p className="mt-2 text-sm text-white">{agent.currentTask}</p>
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-white/40">
                      <span>Progress</span>
                      <span className="font-mono text-white">{agent.progress}%</span>
                    </div>
                    <div className="progress-bar h-2">
                      <div className="progress-fill" style={{ width: `${agent.progress}%` }} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Last Run</p>
                    <p className="mt-2 font-mono text-sm text-white">{relativeTime(agent.lastRunAt)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Uptime</p>
                    <p className="mt-2 font-mono text-sm text-white">{agent.uptimeHours}h</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-4">
          <section className="panel">
            <p className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-[11px] font-semibold uppercase tracking-[0.24em] text-transparent">
              Cron Pulse
            </p>
            <div className="mt-4 space-y-3">
              {cronStatus.jobs.slice(0, 6).map((job) => (
                <div key={job.id} className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm text-white">{job.name}</p>
                    <span className={`badge ${toneClass(job.status)}`}>{job.status}</span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-white/40">
                    Last {relativeTime(job.lastRunAt)} · Next {relativeTime(job.nextRunAt)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <p className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-[11px] font-semibold uppercase tracking-[0.24em] text-transparent">
              Activity Feed
            </p>
            <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1 custom-scroll">
              {activityFeed.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-white">{entry.label}</p>
                    <span className={`badge ${toneClass(entry.status)}`}>{entry.status}</span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-white/40">{shortDate(entry.timestamp)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
