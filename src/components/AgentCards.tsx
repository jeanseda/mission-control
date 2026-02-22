import { useEffect, useMemo, useState } from 'react'

interface AgentCardData {
  id: string
  name: string
  role: string
  model: string
  sessions: number
  uptimeHours: number
  status: 'active' | 'idle'
  lastActivity: string
  tasksCompleted: number
}

interface AgentSeed {
  id: string
  name: string
  role: string
  model: string
  agentId?: string
  status?: 'active' | 'idle'
  uptimeHours?: number
}

interface Props {
  cronJobs: Array<{ agentId?: string; state?: { lastRunAtMs?: number; lastStatus?: string } }>
  boardTasks: Array<{ project?: string; status?: string; completedDate?: string; createdDate?: string }>
  agents?: AgentSeed[]
}

export function AgentCards({ cronJobs, boardTasks, agents }: Props) {
  const [tick, setTick] = useState(Date.now())

  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 60000)
    return () => clearInterval(i)
  }, [])

  const agentData = useMemo<AgentCardData[]>(() => {
    const done = boardTasks.filter(t => t.status === 'done')

    const tasksCompletedFor = (agentKey: string) => {
      const key = agentKey.toLowerCase()
      if (key === 'main' || key === 'max') {
        return done.filter(t => {
          const p = String(t.project || '').toLowerCase()
          return !p.includes('maldo') && !p.includes('dealbot')
        }).length
      }
      return done.filter(t => String(t.project || '').toLowerCase().includes(key)).length
    }

    const byAgent = (agentId?: string) => cronJobs.filter(j => (j.agentId || 'main') === (agentId || 'main'))

    const seeds: AgentSeed[] = (agents && agents.length > 0)
      ? agents
      : [
          { id: 'main', name: 'Main (Max)', role: 'Command Core', model: 'anthropic/claude-opus-4-6', agentId: 'main', uptimeHours: 72 },
          { id: 'maldo', name: 'Maldo', role: 'Client Ops Agent', model: 'anthropic/claude-sonnet-4-5', agentId: 'maldo', uptimeHours: 49 },
          { id: 'dealbot', name: 'DealBot', role: 'Sales Automation', model: 'anthropic/claude-sonnet-4-5', agentId: 'dealbot', uptimeHours: 16 }
        ]

    return seeds.map(seed => {
      const agentId = seed.agentId || seed.id || 'main'
      const last = Math.max(...byAgent(agentId).map(j => j.state?.lastRunAtMs || 0), 0)
      const assumedActiveWindowMs = agentId === 'maldo'
        ? 24 * 60 * 60 * 1000
        : 6 * 60 * 60 * 1000

      const status: 'active' | 'idle' = seed.status
        ? seed.status
        : (Date.now() - last < assumedActiveWindowMs ? 'active' : 'idle')

      return {
        id: seed.id,
        name: seed.name,
        role: seed.role,
        model: seed.model,
        sessions: Math.max(1, byAgent(agentId).length * 2),
        uptimeHours: seed.uptimeHours || 0,
        status,
        lastActivity: formatRelative(last),
        tasksCompleted: tasksCompletedFor(agentId),
      }
    })
  }, [cronJobs, boardTasks, tick])

  const powerLevel = (tasksCompleted: number) => Math.min(9999, 900 + tasksCompleted * 120)

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {agentData.map(agent => (
        <div key={agent.id} className="card agent-card">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="agent-avatar">{agent.name.charAt(0)}</div>
              <div>
                <p className="font-semibold text-lg">{agent.name}</p>
                <p className="text-xs text-zinc-500">{agent.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`status-dot ${agent.status === 'active' ? 'success pulse-strong' : 'idle'}`} />
              <span className={`badge ${agent.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{agent.status}</span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <p className="text-zinc-400">Model: <span className="mono text-zinc-300">{agent.model}</span></p>
            <p className="text-zinc-400">Sessions: <span className="text-zinc-200 font-semibold">{agent.sessions}</span></p>
            <p className="text-zinc-400">Uptime: <span className="text-zinc-200 font-semibold">{agent.uptimeHours}h</span></p>
            <p className="text-zinc-400">Last activity: <span className="text-zinc-200">{agent.lastActivity}</span></p>
          </div>

          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Power Level</p>
            <p className="text-2xl font-black gradient-text mono">{powerLevel(agent.tasksCompleted)}</p>
            <p className="text-xs text-zinc-500">{agent.tasksCompleted} tasks completed</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatRelative(ms: number) {
  if (!ms) return 'n/a'
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
