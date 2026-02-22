import { useState, useEffect } from 'react'
import { KanbanBoard, AddTaskModal } from './components/Kanban'
import { Business } from './components/Business'
import { XPBar, type XPData } from './components/XPBar'
import { Achievements, type Achievement } from './components/Achievements'
import { StatsCard } from './components/StatsCard'
import { ActivityFeed } from './components/ActivityFeed'
import { AgentCards } from './components/AgentCards'
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

type TabType = 'overview' | 'board' | 'agents' | 'business' | 'stats' | 'tools'
type ThemeMode = 'dark' | 'light' | 'system'

interface BusinessMetricsSnapshot {
  goal?: { total?: number }
  history?: Array<{ amount?: number }>
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [boardTasks, setBoardTasks] = useState<KanbanTask[]>([])
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [xpData, setXpData] = useState<XPData | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [businessMetrics, setBusinessMetrics] = useState<BusinessMetricsSnapshot | null>(null)
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

  // Track last updated timestamps for data freshness
  const [lastUpdated, setLastUpdated] = useState<{
    cron?: string
    board?: string
    usage?: string
    business?: string
  }>({})

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
      const [cronRes, boardRes, usageRes, xpRes, achievementsRes, businessRes] = await Promise.all([
        fetch('/api/cron'),
        fetch('/api/board'),
        fetch('/api/usage'),
        fetch('/data/xp.json'),
        fetch('/data/achievements.json'),
        fetch('/api/business')
      ])
      
      const cronData = await cronRes.json()
      const boardData = await boardRes.json()
      const usageData = await usageRes.json()
      const xpSeed = await xpRes.json()
      const achievementsData = await achievementsRes.json()
      const businessData = businessRes.ok ? await businessRes.json() : null

      const parsedCronJobs = Array.isArray(cronData) ? cronData : (cronData?.jobs || [])
      const parsedBoardTasks = Array.isArray(boardData) ? boardData : (boardData?.tasks || [])

      setCronJobs(parsedCronJobs)
      setBoardTasks(parsedBoardTasks)
      setUsage(usageData)
      setAchievements(Array.isArray(achievementsData) ? achievementsData : [])
      setBusinessMetrics(businessData)
      setXpData(calculateXP(parsedBoardTasks, parsedCronJobs, businessData, xpSeed))
      
      // Track last updated timestamps
      setLastUpdated({
        cron: cronData?.lastUpdated,
        board: boardData?.lastUpdated,
        usage: usageData?.lastUpdated,
        business: businessData?.last_updated
      })
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
    { id: 'stats' as const, label: 'Stats', icon: '🎮' },
    { id: 'tools' as const, label: 'Tools', icon: '🛠️' },
  ]

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-8 max-w-7xl mx-auto fade-in">
      {/* Header */}
      <header className="mb-6 md:mb-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-3xl sm:text-4xl md:text-5xl lobster-float">🦞</span>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">
                <span className="gradient-text">Mission Control</span>
              </h1>
              <p className="text-zinc-500 text-xs sm:text-sm mt-1">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                <span className="mx-1 sm:mx-2">•</span>
                <span className="mono">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={cycleTheme}
              className="theme-toggle"
              title={`Theme: ${themeMode}`}
            >
              {getThemeIcon()}
            </button>
            <div className="hidden md:flex items-center gap-3 card px-4 py-2">
              {lastUpdated.cron ? (
                <>
                  <FreshnessIndicator timestamp={lastUpdated.cron} label="Data" />
                  <button 
                    onClick={() => loadData()} 
                    className="text-zinc-400 hover:text-orange-400 transition-colors ml-2"
                    title="Refresh data"
                  >
                    🔄
                  </button>
                </>
              ) : (
                <>
                  <div className="status-dot success" />
                  <span className="text-sm text-zinc-400">System Online</span>
                </>
              )}
            </div>
            {usage && (
              <div className="card px-3 py-1.5 sm:px-4 sm:py-2">
                <span className="text-xs text-zinc-400">Usage: </span>
                <span className={`text-xs sm:text-sm font-bold mono ${
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
      <div className="card mission-card mb-6 md:mb-8">
        <div className="flex items-start gap-3 md:gap-4">
          <span className="text-xl md:text-2xl">🎯</span>
          <div>
            <p className="text-xs uppercase tracking-wider text-orange-400 font-medium mb-1 md:mb-2">Mission Statement</p>
            <p className="text-sm sm:text-base md:text-lg leading-relaxed mission-text">"{missionStatement}"</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav mb-6 md:mb-8 w-full md:w-fit overflow-x-auto scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab min-h-[44px] min-w-[44px] ${activeTab === tab.id ? 'active' : ''}`}
          >
            <span className="mr-1 sm:mr-2">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div key={activeTab} className="tab-transition">
        {activeTab === 'overview' && (
          <OverviewTab 
            cronJobs={cronJobs} 
            boardTasks={boardTasks}
            usage={usage}
            loading={loading}
            lastUpdated={lastUpdated}
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
          <AgentsTab cronJobs={cronJobs} boardTasks={boardTasks} lastUpdated={lastUpdated} />
        )}
        
        {activeTab === 'business' && (
          <Business />
        )}
        
        {activeTab === 'stats' && (
          <StatsTab
            boardTasks={boardTasks}
            cronJobs={cronJobs}
            xpData={xpData}
            achievements={achievements}
            businessMetrics={businessMetrics}
          />
        )}

        {activeTab === 'tools' && (
          <ToolsTab />
        )}
      </div>

      <QuickActionsPanel onAction={(tab) => setActiveTab(tab)} />

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

function OverviewTab({ cronJobs, boardTasks, usage, loading, lastUpdated }: {
  cronJobs: CronJob[]
  boardTasks: KanbanTask[]
  usage: UsageData | null
  loading: boolean
  lastUpdated: {
    cron?: string
    board?: string
    usage?: string
    business?: string
  }
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
  

  if (loading) {
    return <LoadingSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
      <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
        <div className="md:col-span-2 space-y-4">
          <ActivityFeed />

          {/* Today's Wins */}
          {todayWins.length > 0 && (
            <div className="card accent-border">
              <div className="card-header flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>🏆</span> Today's Wins
                </div>
                {lastUpdated.board && <FreshnessIndicator timestamp={lastUpdated.board} />}
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
          <ClockNextEventWidget upcomingJobs={upcomingJobs} />

          {/* System Health */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>💚</span> System Health
              </div>
              {lastUpdated.cron && <FreshnessIndicator timestamp={lastUpdated.cron} />}
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

function AgentsTab({ cronJobs, boardTasks, lastUpdated }: { 
  cronJobs: CronJob[]; 
  boardTasks: KanbanTask[]
  lastUpdated: {
    cron?: string
    board?: string
    usage?: string
    business?: string
  }
}) {
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
      <AgentCards cronJobs={cronJobs} boardTasks={boardTasks} />

      {/* All Cron Jobs Table */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⏰</span> Scheduled Jobs ({cronJobs.length})
          </div>
          {lastUpdated.cron && <FreshnessIndicator timestamp={lastUpdated.cron} />}
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


function ClockNextEventWidget({ upcomingJobs }: { upcomingJobs: CronJob[] }) {
  const now = new Date()
  const next = upcomingJobs[0]

  return (
    <div className="card clock-widget">
      <p className="text-xs uppercase tracking-wider text-zinc-500">Live Clock</p>
      <p className="text-3xl font-bold mono mt-1">{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
      <p className="text-xs text-zinc-500 mt-1">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>

      <div className="mt-4 pt-4 border-t border-zinc-800">
        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Next Scheduled Event</p>
        {next?.state?.nextRunAtMs ? (
          <>
            <p className="font-semibold text-sm">{next.name}</p>
            <p className="text-orange-400 mt-1"><CountdownTimer targetMs={next.state.nextRunAtMs} /></p>
          </>
        ) : (
          <p className="text-zinc-500 text-sm">No scheduled jobs</p>
        )}
      </div>
    </div>
  )
}

function QuickActionsPanel({ onAction }: { onAction: (tab: TabType) => void }) {
  return (
    <div className="quick-actions-panel">
      <a className="quick-action-btn" href="https://geo.audit" target="_blank" rel="noopener noreferrer">🔎 Run Audit</a>
      <button className="quick-action-btn" onClick={() => onAction('tools')}>📊 Check Usage</button>
      <a className="quick-action-btn" href="/data/business-metrics.json" target="_blank" rel="noopener noreferrer">🧠 View Intel</a>
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
  const numericValue = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''))
  const hasNumber = !Number.isNaN(numericValue) && String(value).match(/[0-9]/)
  const [display, setDisplay] = useState(hasNumber ? 0 : 0)

  useEffect(() => {
    if (!hasNumber) return
    const target = numericValue
    const step = Math.max(1, Math.ceil(Math.abs(target - display) / 20))
    const i = setInterval(() => {
      setDisplay(prev => (prev < target ? Math.min(target, prev + step) : Math.max(target, prev - step)))
    }, 22)
    return () => clearInterval(i)
  }, [numericValue, hasNumber])

  const shown = hasNumber ? String(value).replace(/[0-9][0-9.,]*/, Math.round(display).toLocaleString()) : String(value)

  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="stat-value">{shown}</span>
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

// Helper to show freshness indicator
function FreshnessIndicator({ timestamp, label }: { timestamp?: string; label?: string }) {
  if (!timestamp) return null
  
  const ageMs = Date.now() - new Date(timestamp).getTime()
  const ageMins = Math.floor(ageMs / 60000)
  
  const status = ageMins < 5 ? 'success' : ageMins < 60 ? 'warning' : 'danger'
  const text = formatRelativeTime(new Date(timestamp).getTime())
  
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <div className={`status-dot ${status}`} />
      <span>{label ? `${label}: ` : ''}{text}</span>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

function calculateXP(
  boardTasks: KanbanTask[],
  cronJobs: CronJob[],
  business: BusinessMetricsSnapshot | null,
  seed: XPData
): XPData {
  const doneTasks = boardTasks.filter(t => t.status === 'done').length
  const cleanCronRuns = cronJobs.filter(j => j.state?.lastStatus === 'ok').length
  const revenue = Math.max(0, Math.round(business?.goal?.total || 0))
  const uniqueActiveDays = new Set(
    boardTasks
      .map(t => t.completedDate || t.createdDate)
      .filter(Boolean)
  ).size

  const agentsDeployed = 3
  const skillsBuilt = 4

  const earnedFromSources =
    doneTasks * 10 +
    cleanCronRuns * 2 +
    revenue * 100 +
    uniqueActiveDays * 25 +
    agentsDeployed * 50 +
    skillsBuilt * 30

  const totalXpEarned = (seed?.totalXpEarned || 0) + earnedFromSources
  const level = Math.max(1, Math.floor(totalXpEarned / 100) + 1)
  const xp = totalXpEarned % 100

  const title = level <= 1 ? 'Recruit' :
    level <= 5 ? 'Operator' :
    level <= 10 ? 'Commander' :
    level <= 20 ? 'Architect' : 'Emperor'

  return {
    ...seed,
    level,
    xp,
    xpToNext: 100,
    title,
    totalXpEarned,
    history: [
      { source: 'Task completed', amount: doneTasks * 10 },
      { source: 'Cron job ran clean', amount: cleanCronRuns * 2 },
      { source: 'Revenue earned', amount: revenue * 100 },
      { source: 'Streak day', amount: uniqueActiveDays * 25 },
      { source: 'Agent deployed', amount: agentsDeployed * 50 },
      { source: 'Skill built', amount: skillsBuilt * 30 },
    ],
  }
}

function StatsTab({
  boardTasks,
  cronJobs,
  xpData,
  achievements,
  businessMetrics,
}: {
  boardTasks: KanbanTask[]
  cronJobs: CronJob[]
  xpData: XPData | null
  achievements: Achievement[]
  businessMetrics: BusinessMetricsSnapshot | null
}) {
  const tasksDone = boardTasks.filter(task => task.status === 'done').length
  const daysActive = new Set(boardTasks.map(task => task.completedDate || task.createdDate).filter(Boolean)).size
  const agentsRunning = 3
  const skillsBuilt = 4

  const revenueTotal = Math.max(
    0,
    Number(
      businessMetrics?.goal?.total ||
      businessMetrics?.history?.reduce((sum, item) => sum + (item.amount || 0), 0) ||
      0
    )
  )

  const [revenueDisplay, setRevenueDisplay] = useState(0)

  useEffect(() => {
    const target = Math.floor(revenueTotal)
    const step = Math.max(1, Math.ceil(Math.max(1, target) / 60))
    const timer = setInterval(() => {
      setRevenueDisplay(prev => {
        if (prev >= target) return target
        return Math.min(target, prev + step)
      })
    }, 18)

    return () => clearInterval(timer)
  }, [revenueTotal])

  return (
    <div className="space-y-6">
      {xpData && <XPBar xpData={xpData} />}

      <div className={`card revenue-card ${revenueTotal >= 1 ? 'jackpot' : ''}`}>
        <p className="text-xs uppercase tracking-wider text-zinc-400">Total Revenue Earned</p>
        <p className="text-4xl sm:text-6xl font-extrabold mt-2 gradient-text mono">${revenueDisplay.toLocaleString()}</p>
        <p className="text-sm text-zinc-500 mt-2">
          {revenueTotal >= 1 ? 'Jackpot unlocked 💥' : 'Ready for first dollar'}
        </p>
      </div>

      <StatsCard
        stats={{
          tasksDone,
          daysActive,
          agentsRunning,
          skillsBuilt,
        }}
      />

      <div className="card">
        <div className="card-header">
          <span>🏅</span> Achievements
        </div>
        <Achievements achievements={achievements} />
      </div>

      <div className="card">
        <div className="card-header">
          <span>⚡</span> XP Sources
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="item-row">✅ Task completed <span className="font-bold text-emerald-400">+10 XP</span></div>
          <div className="item-row">⏱️ Cron job ran clean <span className="font-bold text-emerald-400">+2 XP</span></div>
          <div className="item-row">💰 Revenue earned <span className="font-bold text-emerald-400">+100 XP / $1</span></div>
          <div className="item-row">🔥 Streak day <span className="font-bold text-emerald-400">+25 XP</span></div>
          <div className="item-row">🤖 Agent deployed <span className="font-bold text-emerald-400">+50 XP</span></div>
          <div className="item-row">🛠️ Skill built <span className="font-bold text-emerald-400">+30 XP</span></div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// TOOLS TAB - Skills & Tools Store
// ═══════════════════════════════════════════════════════════

function ToolsTab() {
  const customSkills = [
    {
      name: 'youtube-transcript',
      icon: '🎬',
      description: 'Extracts YouTube video transcripts. Python venv + youtube-transcript-api.',
      path: 'skills/youtube-transcript/',
      status: 'working' as const,
      statusNote: 'Working',
      tags: ['python', 'venv', 'youtube'],
    },
    {
      name: 'tiktok-trends',
      icon: '📈',
      description: 'Researches trending topics on TikTok, Google Trends, and Twitter for merch opportunities.',
      path: 'skills/tiktok-trends/',
      status: 'working' as const,
      statusNote: 'Google Trends + Twitter working. TikTok Creative Center needs browser upgrade.',
      tags: ['python', 'venv', 'trends', 'merch'],
    },
    {
      name: '#ideas research pipeline',
      icon: '🔍',
      description: 'Auto-researches URLs dropped in Discord #ideas channel. Also works on-demand in WhatsApp ("investiga esto" + link).',
      path: 'agents/research-pipeline/',
      status: 'working' as const,
      statusNote: 'Working',
      tags: ['discord', 'whatsapp', 'research', 'auto'],
    },
  ]

  const builtInSkills = [
    { name: 'weather', icon: '🌤️', description: 'Get current weather and forecasts for any location.' },
    { name: 'github', icon: '🐙', description: 'Interact with GitHub repos, issues, PRs, and more.' },
    { name: 'nano-pdf', icon: '📄', description: 'Extract text and data from PDF documents.' },
    { name: 'video-frames', icon: '🎞️', description: 'Extract frames and thumbnails from video files.' },
    { name: 'web-search', icon: '🔎', description: 'Search the web via Brave Search API.' },
    { name: 'web-fetch', icon: '🌐', description: 'Fetch and extract readable content from URLs.' },
    { name: 'browser', icon: '🖥️', description: 'Full browser automation and control.' },
    { name: 'tts', icon: '🔊', description: 'Text-to-speech via ElevenLabs.' },
    { name: 'image', icon: '🖼️', description: 'Analyze images with vision models.' },
    { name: 'nodes', icon: '📱', description: 'Control paired mobile/desktop nodes (camera, screen, location).' },
  ]

  return (
    <div className="space-y-8">
      {/* Custom Skills */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold mb-1">Custom Skills</h2>
        <p className="text-zinc-500 text-sm mb-4">Skills we built and maintain</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {customSkills.map(skill => (
            <div key={skill.name} className="card group hover:scale-[1.02] transition-transform">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center text-xl sm:text-2xl shrink-0">
                    {skill.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base sm:text-lg truncate">{skill.name}</h3>
                    <p className="text-xs text-zinc-500 truncate">{skill.path}</p>
                  </div>
                </div>
                <div className="status-dot success shrink-0 mt-1" title="Working" />
              </div>
              
              <p className="text-sm text-zinc-400 mb-3">{skill.description}</p>
              
              {skill.statusNote !== 'Working' && (
                <p className="text-xs text-yellow-400/80 mb-3">⚠️ {skill.statusNote}</p>
              )}

              <div className="flex flex-wrap gap-1.5 pt-3 border-t border-zinc-800">
                <span className="badge badge-success">✅ active</span>
                {skill.tags.map(tag => (
                  <span key={tag} className="tag-pill text-[0.65rem]">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Built-in Skills */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold mb-1">Built-in Skills</h2>
        <p className="text-zinc-500 text-sm mb-4">Provided by OpenClaw out of the box</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {builtInSkills.map(skill => (
            <div key={skill.name} className="card text-center py-4 px-3">
              <div className="text-2xl sm:text-3xl mb-2">{skill.icon}</div>
              <h4 className="font-semibold text-sm mb-1">{skill.name}</h4>
              <p className="text-xs text-zinc-500 line-clamp-2">{skill.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
