import { useState, useEffect } from 'react'

interface Activity {
  id: string
  type: 'cron' | 'task' | 'agent' | 'system'
  title: string
  description?: string
  timestamp: string
  status: 'success' | 'error' | 'warning' | 'info'
  agent?: string
  metadata?: Record<string, any>
}

export function ActivityFeed({ limit = 20 }: { limit?: number }) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadActivities()
    const interval = setInterval(loadActivities, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const loadActivities = async () => {
    try {
      const activities: Activity[] = []

      // Get cron job activity
      const cronRes = await fetch('/api/cron')
      const cronData = await cronRes.json()
      const jobs = Array.isArray(cronData) ? cronData : (cronData?.jobs || [])
      
      for (const job of jobs) {
        if (job.state?.lastRunAtMs) {
          activities.push({
            id: `cron-${job.id}-last`,
            type: 'cron',
            title: job.name || job.id,
            description: job.state.lastError || `Completed in ${job.state.lastDurationMs}ms`,
            timestamp: new Date(job.state.lastRunAtMs).toISOString(),
            status: job.state.lastStatus === 'error' ? 'error' : 'success',
            agent: 'automation',
            metadata: { duration: job.state.lastDurationMs }
          })
        }
      }

      // Get task history
      const tasksRes = await fetch('/api/tasks')
      const tasksData = await tasksRes.json()
      
      for (const task of tasksData.slice(0, 10)) {
        activities.push({
          id: task.id,
          type: 'task',
          title: task.action,
          description: task.details,
          timestamp: task.timestamp,
          status: task.result === 'success' ? 'success' : task.result === 'error' ? 'error' : 'info',
          agent: task.source || 'manual',
        })
      }

      // Get board updates (recent changes)
      const boardRes = await fetch('/api/board')
      const boardData = await boardRes.json()
      
      for (const task of boardData.filter((t: any) => t.createdAt).slice(-5)) {
        activities.push({
          id: `board-${task.id}`,
          type: 'task',
          title: `Task created: ${task.title}`,
          description: task.project,
          timestamp: task.createdAt,
          status: 'info',
        })
      }

      // Sort by timestamp descending
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      
      setActivities(activities.slice(0, limit))
    } catch (e) {
      console.error('Failed to load activities:', e)
    } finally {
      setLoading(false)
    }
  }

  const formatTimeAgo = (iso: string) => {
    const now = new Date()
    const then = new Date(iso)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getActivityIcon = (activity: Activity) => {
    if (activity.type === 'cron') return '⏰'
    if (activity.type === 'agent') return '🤖'
    if (activity.type === 'system') return '⚙️'
    if (activity.status === 'success') return '✅'
    if (activity.status === 'error') return '❌'
    if (activity.status === 'warning') return '⚠️'
    return '📋'
  }

  const getActivityClass = (status: string) => {
    switch (status) {
      case 'success': return 'success'
      case 'error': return 'danger'
      case 'warning': return 'warning'
      default: return 'info'
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="shimmer h-60 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <span>📊</span> Activity Feed
        <span className="ml-auto text-xs text-zinc-500 font-normal">Real-time updates</span>
      </div>
      
      <div className="activity-feed">
        {activities.length === 0 ? (
          <p className="text-zinc-500 text-center py-8">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {activities.map(activity => (
              <div key={activity.id} className="activity-item">
                <div className={`activity-icon ${getActivityClass(activity.status)}`}>
                  {getActivityIcon(activity)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-sm truncate">{activity.title}</p>
                    <span className="text-xs text-zinc-500 flex-shrink-0 ml-2">
                      {formatTimeAgo(activity.timestamp)}
                    </span>
                  </div>
                  {activity.description && (
                    <p className="text-xs text-zinc-400 truncate">{activity.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {activity.agent && (
                      <span className="badge badge-neutral text-xs px-2 py-0.5">
                        {activity.agent}
                      </span>
                    )}
                    <span className={`badge badge-${getActivityClass(activity.status)} text-xs px-2 py-0.5`}>
                      {activity.status}
                    </span>
                    {activity.metadata?.duration && (
                      <span className="text-xs text-zinc-500">
                        {activity.metadata.duration}ms
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Quick Stats Component
export function QuickStats() {
  const [stats, setStats] = useState({
    tasksThisWeek: 0,
    usagePercent: 0,
    activeAgents: 0,
    cronJobsRunning: 0,
    lastSync: new Date().toISOString()
  })

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 60000)
    return () => clearInterval(interval)
  }, [])

  const loadStats = async () => {
    try {
      // Get tasks from last 7 days
      const tasksRes = await fetch('/api/tasks')
      const tasks = await tasksRes.json()
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const recentTasks = tasks.filter((t: any) => 
        new Date(t.timestamp) > weekAgo
      )

      // Get usage
      const usageRes = await fetch('/api/usage')
      const usage = await usageRes.json()

      // Get Claude usage for percentage
      let usagePercent = 0
      try {
        const claudeRes = await fetch('/data/claude-usage.json')
        if (claudeRes.ok) {
          const claudeData = await claudeRes.json()
          usagePercent = claudeData.limits?.weeklyAllModels?.used || 0
        }
      } catch (e) {
        // Fallback calculation
        usagePercent = Math.round((usage.totals.sessions / 50) * 100) // rough estimate
      }

      // Get cron jobs
      const cronRes = await fetch('/api/cron')
      const cronData = await cronRes.json()
      const jobs = Array.isArray(cronData) ? cronData : (cronData?.jobs || [])
      const activeJobs = jobs.filter((j: any) => j.enabled !== false)

      setStats({
        tasksThisWeek: recentTasks.length,
        usagePercent: Math.min(usagePercent, 100),
        activeAgents: 2, // maldo + fitness
        cronJobsRunning: activeJobs.length,
        lastSync: new Date().toISOString()
      })
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
  }

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('en-US', { 
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="stat-card">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
          <span>✅</span>
          <span>This Week</span>
        </div>
        <div className="stat-value">{stats.tasksThisWeek}</div>
        <p className="text-xs text-zinc-500 mt-1">tasks completed</p>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
          <span>📊</span>
          <span>Usage</span>
        </div>
        <div className="stat-value">{stats.usagePercent}%</div>
        <p className="text-xs text-zinc-500 mt-1">of weekly quota</p>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
          <span>🤖</span>
          <span>Agents</span>
        </div>
        <div className="stat-value">{stats.activeAgents}</div>
        <p className="text-xs text-zinc-500 mt-1">running</p>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
          <span>⚡</span>
          <span>Automations</span>
        </div>
        <div className="stat-value">{stats.cronJobsRunning}</div>
        <p className="text-xs text-zinc-500 mt-1">active jobs</p>
      </div>
    </div>
  )
}
