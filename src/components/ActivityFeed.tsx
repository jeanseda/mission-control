import { useEffect, useMemo, useState } from 'react'

type FeedStatus = 'success' | 'error' | 'info'

interface FeedEvent {
  id: string
  icon: string
  description: string
  timestamp: number
  status: FeedStatus
}

interface BoardTask {
  id: string
  title: string
  project?: string
  status?: string
  createdDate?: string
  completedDate?: string
  tags?: string[]
  description?: string
}

interface CronJob {
  id: string
  name: string
  state?: {
    lastRunAtMs?: number
    lastStatus?: string
  }
}

function parseDayToMs(day?: string) {
  if (!day) return 0
  const ms = new Date(`${day}T12:00:00`).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

export function ActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [prevTopId, setPrevTopId] = useState<string | null>(null)

  const load = async () => {
    try {
      const [boardRes, cronRes] = await Promise.all([
        fetch('/data/board.json'),
        fetch('/data/cron-jobs.json'),
      ])

      const board: BoardTask[] = await boardRes.json()
      const cronFile = await cronRes.json()
      const jobs: CronJob[] = Array.isArray(cronFile) ? cronFile : cronFile.jobs || []

      const built: FeedEvent[] = []

      for (const job of jobs) {
        if (!job.state?.lastRunAtMs) continue
        built.push({
          id: `cron-${job.id}-${job.state.lastRunAtMs}`,
          icon: job.state.lastStatus === 'ok' ? '✅' : '❌',
          description: `${job.name} ${job.state.lastStatus === 'ok' ? 'ran successfully' : 'failed to run'}`,
          timestamp: job.state.lastRunAtMs,
          status: job.state.lastStatus === 'ok' ? 'success' : 'error',
        })
      }

      const sortedBoard = [...board].sort((a, b) => {
        const bMs = parseDayToMs(b.completedDate) || parseDayToMs(b.createdDate)
        const aMs = parseDayToMs(a.completedDate) || parseDayToMs(a.createdDate)
        return bMs - aMs
      })

      for (const task of sortedBoard.slice(0, 24)) {
        if (task.createdDate) {
          built.push({
            id: `file-${task.id}-created`,
            icon: '📝',
            description: `File/task modified: ${task.title}`,
            timestamp: parseDayToMs(task.createdDate),
            status: 'info',
          })
        }
        if (task.completedDate) {
          built.push({
            id: `agent-${task.id}-done`,
            icon: '🤖',
            description: `Sub-agent completed task: ${task.title}`,
            timestamp: parseDayToMs(task.completedDate),
            status: 'success',
          })
        }

        const hasAgentTag = (task.tags || []).some(t => ['agent', 'automation', 'workflow'].includes(t.toLowerCase()))
        if (hasAgentTag && task.createdDate) {
          built.push({
            id: `agent-${task.id}-spawn`,
            icon: '🚀',
            description: `Sub-agent spawned for ${task.project || 'operations'}`,
            timestamp: parseDayToMs(task.createdDate) + 1000,
            status: 'info',
          })
        }

        const msgCount = ((task.description || '').match(/message/gi) || []).length
        if (msgCount > 0) {
          built.push({
            id: `msg-${task.id}`,
            icon: '💬',
            description: `Messages sent/received activity detected (${msgCount})`,
            timestamp: parseDayToMs(task.completedDate || task.createdDate),
            status: 'info',
          })
        }
      }

      built.sort((a, b) => b.timestamp - a.timestamp)
      const top = built.slice(0, 20)

      setPrevTopId(events[0]?.id || null)
      setEvents(top)
    } catch (e) {
      console.error('Activity feed load failed', e)
    }
  }

  useEffect(() => {
    load()
    const i = setInterval(load, 20000)
    return () => clearInterval(i)
  }, [])

  const rendered = useMemo(() => events, [events])

  return (
    <div className="card">
      <div className="card-header">
        <span>📡</span> Live Activity Feed
      </div>
      <div className="max-h-[460px] overflow-y-auto pr-1 space-y-2">
        {rendered.map((event, idx) => (
          <div
            key={event.id}
            className={`activity-row slide-in ${idx === 0 && prevTopId && prevTopId !== event.id ? 'new' : ''}`}
            style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
          >
            <div className={`activity-pill ${event.status}`}>{event.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{event.description}</p>
              <p className="text-xs text-zinc-500">{formatTime(event.timestamp)}</p>
            </div>
            <span className={`badge ${event.status === 'success' ? 'badge-success' : event.status === 'error' ? 'badge-danger' : 'badge-info'}`}>
              {event.status}
            </span>
          </div>
        ))}
        {rendered.length === 0 && <p className="text-zinc-500 text-sm">No activity yet</p>}
      </div>
    </div>
  )
}

function formatTime(ms: number) {
  if (!ms) return 'unknown'
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
