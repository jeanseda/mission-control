import { useState, useEffect } from 'react'
import { KanbanBoard, AddTaskModal } from './components/Kanban'
import { Business } from './components/Business'
import type { KanbanTask } from './components/Kanban'

// Types
interface CronJob {
  id: string
  name: string
  schedule: string | { kind?: string; expr?: string; everyMs?: number; at?: string; tz?: string }
  enabled?: boolean
  state?: { 
    nextRunAtMs?: number
    lastRunAtMs?: number
    lastStatus?: string
    lastError?: string
    lastDurationMs?: number
  }
}

interface UsageData {
  plan: string
  current_session: { percent_used: number; resets_in: string }
  weekly_all_models: { percent_used: number; resets: string }
  weekly_sonnet: { percent_used: number; resets: string }
  lastUpdated: string
}

type TabType = 'overview' | 'board' | 'agents' | 'business' | 'tools'
type ThemeMode = 'dark' | 'light' | 'system'

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [boardTasks, setBoardTasks] = useState<KanbanTask[]>([])
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  
  // Theme state with system preference support
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('themeMode')
      if (saved) return saved as ThemeMode
    }
    return 'system'
  })

  const [actualTheme, setActualTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('themeMode')
      if (saved === 'dark' || saved === 'light') return saved
      // Use system preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light'
      }
    }
    return 'dark'
  })

  const missionStatement = "Build an autonomous organization of AI agents that produces value 24/7 — tools, agents, and hardware that work for me while I sleep."

  // Theme management
  useEffect(() => {
    // Apply theme class to document
    document.documentElement.setAttribute('data-theme', actualTheme)
    
    // If system mode, listen for system preference changes
    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => {
        setActualTheme(e.matches ? 'dark' : 'light')
      }
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [themeMode, actualTheme])

  const cycleTheme = () => {
    const nextMode: ThemeMode = 
      themeMode === 'dark' ? 'light' :
      themeMode === 'light' ? 'system' : 'dark'
    
    setThemeMode(nextMode)
    
    if (nextMode === 'system') {
      localStorage.removeItem('themeMode')
      // Set to current system preference
      const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      setActualTheme(isDark ? 'dark' : 'light')
    } else {
      localStorage.setItem('themeMode', nextMode)
      setActualTheme(nextMode)
    }
  }

  const getThemeIcon = () => {
    if (themeMode === 'system') return '💻'
    return themeMode === 'dark' ? '🌙' : '☀️'
  }

  // Load data
  useEffect(() => {
    loadData()
    
    // Auto-refresh every 30 seconds for overview tab
    const dataInterval = setInterval(() => {
      if (activeTab === 'overview') {
        loadData()
      }
    }, 30000)
    
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000)
    
    return () => {
      clearInterval(dataInterval)
      clearInterval(timeInterval)
    }
  }, [activeTab])

  const loadData = async () => {
    try {
      const [cronRes, boardRes, usageRes] = await Promise.all([
        fetch('/api/cron'),
        fetch('/api/board'),
        fetch('/api/usage')
      ])
      
      const cronData = await cronRes.json()
      const boardData = await boardRes.json()
      const usageData = await usageRes.json()
      
      setCronJobs(Array.isArray(cronData) ? cronData : (cronData?.jobs || []))
      setBoardTasks(Array.isArray(boardData) ? boardData : (boardData?.tasks || []))
      setUsage(usageData)
    } catch (e) {
      console.error('Load error:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleTaskMove = async (taskId: string, newStatus: KanbanTask['status']) => {
    try {
      const updateData: any = { status: newStatus }
      
      // If moving to done, add completedDate
      if (newStatus === 'done') {
        updateData.completedDate = new Date().toISOString().split('T')[0]
      }
      
      await fetch(`/api/board/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })
      
      setBoardTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, ...updateData } : t
      ))
    } catch (e) {
      console.error('Failed to move task:', e)
    }
  }

  const handleAddTask = async (task: Omit<KanbanTask, 'id'>) => {
    try {
      const res = await fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...task,
          createdDate: new Date().toISOString().split('T')[0]
        })
      })
      const newTask = await res.json()
      setBoardTasks(prev => [...prev, newTask])
      setShowAddTask(false)
    } catch (e) {
      console.error('Failed to add task:', e)
    }
  }

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: '🎯' },
    { id: 'board' as const, label: 'Board', icon: '📋' },
    { id: 'agents' as const, label: 'Agents & Cron', icon: '🤖' },
    { id: 'business' as const, label: 'Business', icon: '💼' },
    { id: 'tools' as const, label: 'Tools', icon: '🛠️' },
  ]

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto fade-in">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <span className="text-5xl lobster-float">🦞</span>
            <div>
              <h1 className="text-3xl font-bold">
                <span className="gradient-text">Mission Control</span>
              </h1>
              <p className="text-zinc-500 text-sm mt-1">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                <span className="mx-2">•</span>
                <span className="mono">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={cycleTheme}
              className="theme-toggle"
              title={`Theme: ${themeMode}`}
            >
              {getThemeIcon()}
            </button>
            <div className="hidden md:flex items-center gap-3 card px-4 py-2">
              <div className="status-dot success" />
              <span className="text-sm text-zinc-400">System Online</span>
            </div>
            {usage && (
              <div className="card px-4 py-2">
                <span className="text-xs text-zinc-400">Usage: </span>
                <span className={`text-sm font-bold mono ${
                  usage.weekly_all_models.percent_used > 80 ? 'text-red-400' :
                  usage.weekly_all_models.percent_used > 50 ? 'text-yellow-400' :
                  'text-green-400'
                }`}>
                  {usage.weekly_all_models.percent_used}%
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mission Statement */}
      <div className="card mission-card mb-8">
        <div className="flex items-start gap-4">
          <span className="text-2xl">🎯</span>
          <div>
            <p className="text-xs uppercase tracking-wider text-orange-400 font-medium mb-2">Mission Statement</p>
            <p className="text-lg leading-relaxed mission-text">"{missionStatement}"</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav mb-8 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab 
          cronJobs={cronJobs} 
          boardTasks={boardTasks}
          usage={usage}
          loading={loading}
        />
      )}
      
      {activeTab === 'board' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Task Board</h2>
            <button 
              onClick={() => setShowAddTask(true)}
              className="btn-primary"
            >
              + Add Task
            </button>
          </div>
          <KanbanBoard 
            tasks={boardTasks} 
            onTaskMove={handleTaskMove}
          />
          <AddTaskModal 
            isOpen={showAddTask} 
            onClose={() => setShowAddTask(false)} 
            onAdd={handleAddTask}
          />
        </div>
      )}
      
      {activeTab === 'agents' && (
        <AgentsTab cronJobs={cronJobs} />
      )}
      
      {activeTab === 'business' && (
        <Business />
      )}
      
      {activeTab === 'tools' && (
        <ToolsTab />
      )}

      {/* Footer */}
      <footer className="mt-12 text-center">
        <p className="text-zinc-600 text-sm">
          <span className="lobster-float inline-block">🦞</span>
          <span className="mx-2">Max</span>
          <span className="text-zinc-700">•</span>
          <span className="mx-2">OpenClaw Mission Control</span>
          <span className="text-zinc-700">•</span>
          <span className="mx-2 mono text-xs">{cronJobs.filter(j => j.enabled !== false).length} active jobs</span>
        </p>
      </footer>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// OVERVIEW TAB - The Money Tab
// ═══════════════════════════════════════════════════════════

function OverviewTab({ cronJobs, boardTasks, usage, loading }: {
  cronJobs: CronJob[]
  boardTasks: KanbanTask[]
  usage: UsageData | null
  loading: boolean
}) {
  const activeJobs = cronJobs.filter(j => j.enabled !== false).length
  
  // Today's wins - tasks completed today
  const today = new Date().toISOString().split('T')[0]
  const todayWins = boardTasks.filter(t => t.completedDate === today)
  
  // Next 3 scheduled jobs
  const upcomingJobs = cronJobs
    .filter(j => j.enabled !== false && j.state?.nextRunAtMs)
    .sort((a, b) => (a.state!.nextRunAtMs || 0) - (b.state!.nextRunAtMs || 0))
    .slice(0, 3)
  
  // Last 10 cron job results
  const recentResults = cronJobs
    .filter(j => j.state?.lastRunAtMs)
    .sort((a, b) => (b.state!.lastRunAtMs || 0) - (a.state!.lastRunAtMs || 0))
    .slice(0, 10)

  if (loading) {
    return <LoadingSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="💰" label="MRR" value="$0" subtext="early days" />
        <StatCard icon="👥" label="Active Clients" value="1" subtext="onboarding" />
        <StatCard icon="⚙️" label="Cron Jobs" value={activeJobs} subtext="running" />
        {usage && (
          <StatCard 
            icon="📊" 
            label="Weekly Usage" 
            value={`${usage.weekly_all_models.percent_used}%`}
            subtext={usage.weekly_all_models.resets}
          />
        )}
      </div>

      {/* Main Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Activity Feed - Last 10 cron results */}
        <div className="md:col-span-2 space-y-4">
          <div className="card">
            <div className="card-header">
              <span>📡</span> Recent Activity
            </div>
            {recentResults.length === 0 ? (
              <p className="text-zinc-500 text-sm">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {recentResults.map(job => (
                  <div key={`${job.id}-${job.state?.lastRunAtMs}`} className="item-row">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`status-dot ${
                        job.state?.lastStatus === 'ok' ? 'success' : 'danger'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{job.name}</p>
                        <p className="text-xs text-zinc-500">
                          {formatRelativeTime(job.state?.lastRunAtMs || 0)}
                          {job.state?.lastDurationMs && (
                            <span className="ml-2">• {Math.round(job.state.lastDurationMs)}ms</span>
                          )}
                        </p>
                        {job.state?.lastError && (
                          <p className="error-message mt-1">{job.state.lastError}</p>
                        )}
                      </div>
                    </div>
                    <span className={`badge ${
                      job.state?.lastStatus === 'ok' ? 'badge-success' : 'badge-danger'
                    }`}>
                      {job.state?.lastStatus || 'unknown'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Today's Wins */}
          {todayWins.length > 0 && (
            <div className="card accent-border">
              <div className="card-header">
                <span>🏆</span> Today's Wins
              </div>
              <div className="space-y-2">
                {todayWins.map(task => (
                  <div key={task.id} className="item-row">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">✅</span>
                      <div>
                        <p className="font-medium">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-zinc-500">{task.description}</p>
                        )}
                      </div>
                    </div>
                    {task.priority && (
                      <span className={`badge ${
                        task.priority === 'critical' ? 'badge-danger' :
                        task.priority === 'high' ? 'badge-warning' :
                        'badge-neutral'
                      }`}>
                        {task.priority}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Next Up - Next 3 scheduled jobs */}
          <div className="card">
            <div className="card-header">
              <span>⏰</span> Next Up
            </div>
            {upcomingJobs.length === 0 ? (
              <p className="text-zinc-500 text-sm">No jobs scheduled</p>
            ) : (
              <div className="space-y-3">
                {upcomingJobs.map(job => (
                  <div key={job.id} className="item-row flex-col items-start gap-1">
                    <p className="font-medium text-sm">{job.name}</p>
                    <div className="flex items-center gap-2 w-full">
                      <CountdownTimer targetMs={job.state!.nextRunAtMs!} />
                      <div className={`status-dot ${
                        job.state?.lastStatus === 'ok' ? 'success' :
                        job.state?.lastStatus === 'error' ? 'danger' : 'idle'
                      }`} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System Health */}
          <div className="card">
            <div className="card-header">
              <span>💚</span> System Health
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <div className="status-dot success" />
                  <span className="text-sm font-semibold">Agents</span>
                </div>
                <span className="text-emerald-400 font-bold">2</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2">
                  <div className="status-dot success" />
                  <span className="text-sm font-semibold">Cron Jobs</span>
                </div>
                <span className="text-blue-400 font-bold">{activeJobs}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <div className="flex items-center gap-2">
                  <div className="status-dot success" />
                  <span className="text-sm font-semibold">Projects</span>
                </div>
                <span className="text-orange-400 font-bold">4</span>
              </div>
            </div>
          </div>

          {/* External Links */}
          <div className="card">
            <div className="card-header">
              <span>🔗</span> Quick Links
            </div>
            <div className="space-y-2">
              <a 
                href="https://fitness-dashboard-vite.onrender.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="item-row cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">💪</span>
                  <span className="text-sm group-hover:text-orange-400 transition-colors">
                    Fitness Dashboard
                  </span>
                </div>
                <span className="text-zinc-500">→</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// AGENTS & CRON TAB
// ═══════════════════════════════════════════════════════════

function AgentsTab({ cronJobs }: { cronJobs: CronJob[] }) {
  // Agents (hardcoded for now - could be dynamic later)
  const agents = [
    { 
      name: 'Maldo Agent', 
      status: 'active' as const, 
      channel: '#maldo-test', 
      description: 'WhatsApp assistant for Maldo Distributors',
      missions: 0
    },
    { 
      name: 'Fitness Coach', 
      status: 'active' as const, 
      channel: '#fitness-coach',
      description: 'Notion-powered fitness tracking and coaching',
      missions: 0
    },
    { 
      name: 'Vic Missions', 
      status: 'active' as const, 
      channel: '#vic-workspace',
      description: 'Personal AI assistant and mission manager',
      missions: 0
    },
  ]

  const formatSchedule = (schedule: unknown): string => {
    if (typeof schedule === 'string') return schedule
    if (schedule && typeof schedule === 'object') {
      const s = schedule as { kind?: string; expr?: string; everyMs?: number }
      if (s.kind === 'cron' && s.expr) return s.expr
      if (s.kind === 'every' && s.everyMs) {
        const mins = Math.round(s.everyMs / 60000)
        return mins < 60 ? `every ${mins}m` : `every ${Math.round(mins / 60)}h`
      }
      return 'scheduled'
    }
    return String(schedule)
  }

  return (
    <div className="space-y-6">
      {/* Agent Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {agents.map(agent => (
          <div key={agent.name} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                  agent.status === 'active' ? 'bg-emerald-500/20' : 'bg-zinc-700/50'
                }`}>
                  {agent.name.includes('Fitness') ? '🏋️' : 
                   agent.name.includes('Maldo') ? '🤖' : '🎯'}
                </div>
                <div>
                  <p className="font-semibold text-lg">{agent.name}</p>
                  <p className="text-xs text-zinc-500">{agent.channel}</p>
                </div>
              </div>
              <span className={`badge ${agent.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                {agent.status}
              </span>
            </div>
            <p className="text-sm text-zinc-400 mb-4">{agent.description}</p>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
              <div>
                <p className="text-xs text-zinc-500">Missions</p>
                <p className="text-xl font-bold">{agent.missions}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Status</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="status-dot success" />
                  <p className="text-sm font-medium text-emerald-400">Running</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* All Cron Jobs Table */}
      <div className="card">
        <div className="card-header">
          <span>⏰</span> Scheduled Jobs ({cronJobs.length})
        </div>
        {cronJobs.length === 0 ? (
          <p className="text-zinc-500 text-sm">No cron jobs configured</p>
        ) : (
          <div className="space-y-2">
            {cronJobs.map(job => (
              <div key={job.id} className="item-row">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`status-dot ${
                    job.enabled === false ? 'idle' :
                    job.state?.lastStatus === 'ok' ? 'success' : 
                    job.state?.lastStatus === 'error' ? 'danger' : 'idle'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{job.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-xs text-zinc-500 mono">{formatSchedule(job.schedule)}</p>
                      {job.state?.nextRunAtMs && (
                        <>
                          <span className="text-zinc-700">•</span>
                          <p className="text-xs text-orange-400">
                            Next: <CountdownTimer targetMs={job.state.nextRunAtMs} inline />
                          </p>
                        </>
                      )}
                      {job.state?.lastRunAtMs && (
                        <>
                          <span className="text-zinc-700">•</span>
                          <p className="text-xs text-zinc-500">
                            Last: {formatRelativeTime(job.state.lastRunAtMs)}
                          </p>
                        </>
                      )}
                    </div>
                    {job.state?.lastError && (
                      <p className="error-message mt-1">{job.state.lastError}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {job.state?.lastStatus && (
                    <span className={`badge ${
                      job.state.lastStatus === 'ok' ? 'badge-success' : 'badge-danger'
                    }`}>
                      {job.state.lastStatus}
                    </span>
                  )}
                  {job.enabled === false && (
                    <span className="badge badge-neutral">disabled</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════

function StatCard({ icon, label, value, subtext }: { 
  icon: string
  label: string
  value: string | number
  subtext: string
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="stat-value">{value}</span>
      </div>
      <p className="text-xs text-zinc-500 mt-1">{subtext}</p>
    </div>
  )
}

function CountdownTimer({ targetMs, inline = false }: { targetMs: number; inline?: boolean }) {
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    const update = () => {
      const now = Date.now()
      const diff = targetMs - now
      
      if (diff < 0) {
        setCountdown(inline ? 'running...' : 'Running now...')
        return
      }

      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      const hours = Math.floor(mins / 60)
      const days = Math.floor(hours / 24)

      if (days > 0) {
        setCountdown(inline ? `${days}d ${hours % 24}h` : `${days}d ${hours % 24}h ${mins % 60}m`)
      } else if (hours > 0) {
        setCountdown(inline ? `${hours}h ${mins % 60}m` : `${hours}h ${mins % 60}m ${secs}s`)
      } else if (mins > 0) {
        setCountdown(inline ? `${mins}m` : `${mins}m ${secs}s`)
      } else {
        setCountdown(inline ? `${secs}s` : `${secs}s`)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [targetMs, inline])

  return <span className="countdown">{countdown}</span>
}

function formatRelativeTime(ms: number): string {
  const now = Date.now()
  const diff = now - ms
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="skeleton h-96 rounded-xl" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-64 rounded-xl" />
          <div className="skeleton h-48 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// TOOLS TAB - Skills & Tools Store
// ═══════════════════════════════════════════════════════════

interface Skill {
  name: string
  description: string
  path: string
  scripts: string[]
  category: 'skill' | 'script' | 'agent-tool'
  hasVenv: boolean
  createdDate: string
}

function ToolsTab() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'skill' | 'script' | 'agent-tool'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadSkills()
  }, [])

  const loadSkills = async () => {
    try {
      const res = await fetch('/api/skills')
      const data = await res.json()
      setSkills(data.skills || [])
    } catch (e) {
      console.error('Failed to load skills:', e)
    } finally {
      setLoading(false)
    }
  }

  const filteredSkills = skills.filter(skill => {
    const matchesFilter = filter === 'all' || skill.category === filter
    const matchesSearch = search === '' || 
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const getIcon = (category: string) => {
    switch (category) {
      case 'skill': return '📦'
      case 'script': return '🔧'
      case 'agent-tool': return '🤖'
      default: return '🛠️'
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'skill': return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
      case 'script': return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
      case 'agent-tool': return 'bg-purple-500/15 text-purple-400 border-purple-500/30'
      default: return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
    }
  }

  const comingSoon = [
    { name: 'Gmail Integration', description: 'Send and receive emails via Gmail API', icon: '📧' },
    { name: 'Google Calendar', description: 'Manage calendar events and schedules', icon: '📅' },
    { name: 'Receipt Scanner', description: 'OCR and parse receipts automatically', icon: '🧾' },
    { name: 'Telegram Bot', description: 'Custom Telegram bot integration', icon: '✈️' },
  ]

  if (loading) {
    return <LoadingSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Tools & Skills</h2>
          <p className="text-zinc-500 text-sm mt-1">
            {filteredSkills.length} {filter === 'all' ? 'total' : filter} tools available
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <input
            type="text"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900/50 text-sm focus:border-orange-500 outline-none min-w-[200px]"
          />
          
          <div className="flex gap-2">
            {['all', 'skill', 'script', 'agent-tool'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  filter === f 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'agent-tool' ? 'Agent' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSkills.map(skill => (
          <div key={skill.path} className="card group hover:scale-[1.02] transition-transform">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center text-2xl">
                  {getIcon(skill.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg truncate">{skill.name}</h3>
                  <p className="text-xs text-zinc-500 truncate">{skill.path}</p>
                </div>
              </div>
              {skill.scripts.length > 0 && (
                <div className="status-dot success" title="Functional" />
              )}
            </div>
            
            <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
              {skill.description}
            </p>
            
            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`badge ${getCategoryColor(skill.category)}`}>
                {skill.category}
              </span>
              {skill.hasVenv && (
                <span className="badge bg-green-500/15 text-green-400 border-green-500/30">
                  venv
                </span>
              )}
              {skill.scripts.length > 0 && (
                <span className="badge badge-neutral">
                  {skill.scripts.length} {skill.scripts.length === 1 ? 'script' : 'scripts'}
                </span>
              )}
            </div>
            
            {skill.scripts.length > 0 && (
              <div className="pt-3 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1">Scripts:</p>
                <div className="flex flex-wrap gap-1">
                  {skill.scripts.slice(0, 3).map(script => (
                    <span key={script} className="tag-pill mono text-[0.65rem]">
                      {script}
                    </span>
                  ))}
                  {skill.scripts.length > 3 && (
                    <span className="tag-pill text-[0.65rem]">
                      +{skill.scripts.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
            
            <div className="pt-3 border-t border-zinc-800 mt-3">
              <p className="text-xs text-zinc-600">
                Created: {new Date(skill.createdDate).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {filteredSkills.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-zinc-500">No tools found matching your criteria</p>
        </div>
      )}

      {/* Coming Soon Section */}
      <div className="mt-12">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span>🚀</span> Coming Soon
        </h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {comingSoon.map(tool => (
            <div key={tool.name} className="card opacity-50 cursor-not-allowed">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-xl">
                  {tool.icon}
                </div>
                <h4 className="font-semibold text-sm">{tool.name}</h4>
              </div>
              <p className="text-xs text-zinc-500">{tool.description}</p>
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <span className="badge badge-neutral text-[0.65rem]">In Development</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
