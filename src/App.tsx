import { useState, useEffect } from 'react'
import { CalendarGrid } from './components/Calendar'
import { KanbanBoard, AddTaskModal } from './components/Kanban'
import { UsagePanel } from './components/Usage'
import { ActivityFeed, QuickStats } from './components/ActivityFeed'
import type { KanbanTask } from './components/Kanban'

// Types
interface CronJob {
  id: string
  name: string
  schedule: string | { kind?: string; expr?: string; everyMs?: number; at?: string; tz?: string }
  enabled?: boolean
  state?: { nextRunAtMs?: number; lastRunAtMs?: number; lastStatus?: string }
}

interface Agent {
  name: string
  status: 'active' | 'idle' | 'error'
  channel: string
  lastActivity?: string
  missionsCompleted?: number
}

interface Project {
  name: string
  status: 'active' | 'building' | 'live' | 'paused'
  progress: number
  description?: string
}

interface FitnessData {
  weight: number
  bodyFat: number
  muscleMass: number
  phase: string
  caloriesTarget: number
  proteinTarget: number
  todayCalories?: number
  todayProtein?: number
}

interface CalendarEvent {
  id: string
  title: string
  type: 'scheduled' | 'completed' | 'error'
  time: string
  schedule?: string
}

interface Document {
  name: string
  path: string
  type: 'markdown' | 'json' | 'other'
  size: number
  modified: string
  category: string
}

interface DocumentContent {
  path: string
  name: string
  content: string
  size: number
  modified: string
}

interface TaskLog {
  id: string
  timestamp: string
  action: string
  result: 'success' | 'error' | 'pending'
  details?: string
  source?: string
}

type TabType = 'overview' | 'board' | 'calendar' | 'docs' | 'tasks' | 'agents' | 'fitness' | 'business' | 'usage'

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [tasks, setTasks] = useState<TaskLog[]>([])
  const [boardTasks, setBoardTasks] = useState<KanbanTask[]>([])
  const [showAddTask, setShowAddTask] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedDoc, setSelectedDoc] = useState<DocumentContent | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
    }
    return 'dark'
  })

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  // Static data for now - will be dynamic later
  const agents: Agent[] = [
    { name: 'Fitness Coach', status: 'active', channel: '#fitness-coach', missionsCompleted: 0 },
    { name: 'Vic Missions', status: 'active', channel: '#vic-workspace', missionsCompleted: 0 },
  ]

  const projects: Project[] = [
    { name: 'DealBot', status: 'building', progress: 45, description: 'WhatsApp price tracker' },
    { name: 'Mission Control', status: 'building', progress: 65, description: 'This dashboard' },
    { name: 'Fitness Dashboard', status: 'live', progress: 100, description: 'Notion-powered fitness tracking' },
    { name: 'AI Automation Biz', status: 'active', progress: 25, description: 'Umbrella project — $10K/month goal' },
  ]

  const fitness: FitnessData = {
    weight: 164.9,
    bodyFat: 19.8,
    muscleMass: 125.6,
    phase: 'Lean Bulk',
    caloriesTarget: 2800,
    proteinTarget: 170,
    todayCalories: 1200,
    todayProtein: 85,
  }

  const missionStatement = "Build an autonomous organization of AI agents that produces value 24/7 — tools, agents, and hardware that work for me while I sleep."

  useEffect(() => {
    loadData()
    const dataInterval = setInterval(loadData, 60000)
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => {
      clearInterval(dataInterval)
      clearInterval(timeInterval)
    }
  }, [])

  const loadData = async () => {
    try {
      // Fetch cron jobs
      const cronRes = await fetch('/api/cron')
      const cronData = await cronRes.json()
      setCronJobs(Array.isArray(cronData) ? cronData : (cronData?.jobs || []))

      // Fetch calendar events
      const calRes = await fetch('/api/calendar')
      const calData = await calRes.json()
      setCalendarEvents(Array.isArray(calData) ? calData : [])

      // Fetch documents
      const docsRes = await fetch('/api/documents')
      const docsData = await docsRes.json()
      setDocuments(Array.isArray(docsData) ? docsData : [])

      // Fetch tasks
      const tasksRes = await fetch('/api/tasks')
      const tasksData = await tasksRes.json()
      setTasks(Array.isArray(tasksData) ? tasksData : [])

      // Fetch board
      const boardRes = await fetch('/api/board')
      const boardData = await boardRes.json()
      setBoardTasks(Array.isArray(boardData) ? boardData : [])
    } catch (e) {
      console.error('Load error:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleTaskMove = async (taskId: string, newStatus: KanbanTask['status']) => {
    try {
      await fetch(`/api/board/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      setBoardTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    } catch (e) {
      console.error('Failed to move task:', e)
    }
  }

  const handleAddTask = async (task: Omit<KanbanTask, 'id'>) => {
    try {
      const res = await fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      })
      const newTask = await res.json()
      setBoardTasks(prev => [...prev, newTask])
    } catch (e) {
      console.error('Failed to add task:', e)
    }
  }

  const loadDocument = async (path: string) => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(path)}`)
      const data = await res.json()
      setSelectedDoc(data)
    } catch (e) {
      console.error('Failed to load document:', e)
    }
  }

  const formatSchedule = (schedule: unknown): string => {
    if (typeof schedule === 'string') return schedule
    if (schedule && typeof schedule === 'object') {
      const s = schedule as { kind?: string; expr?: string; everyMs?: number }
      if (s.kind === 'cron' && s.expr) return s.expr
      if (s.kind === 'every' && s.everyMs) return `every ${Math.round(s.everyMs / 60000)}m`
      return 'scheduled'
    }
    return String(schedule)
  }

  const formatNextRun = (job: CronJob): string => {
    if (!job.state?.nextRunAtMs) {
      return formatSchedule(job.schedule)
    }
    
    const nextRun = new Date(job.state.nextRunAtMs)
    const now = new Date()
    const diffMs = nextRun.getTime() - now.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    
    if (diffMs < 0) return 'running...'
    if (diffMins < 1) return 'in <1m'
    if (diffMins < 60) return `in ${diffMins}m`
    if (diffHours < 24) {
      const mins = diffMins % 60
      return mins > 0 ? `in ${diffHours}h ${mins}m` : `in ${diffHours}h`
    }
    
    // Tomorrow or later - show time
    const isToday = nextRun.toDateString() === now.toDateString()
    const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === nextRun.toDateString()
    
    const timeStr = nextRun.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    
    if (isToday) return `today ${timeStr}`
    if (isTomorrow) return `tomorrow ${timeStr}`
    
    return nextRun.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  }

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: '🎯' },
    { id: 'board' as const, label: 'Board', icon: '📋' },
    { id: 'calendar' as const, label: 'Calendar', icon: '📅' },
    { id: 'docs' as const, label: 'Docs', icon: '📄' },
    { id: 'tasks' as const, label: 'History', icon: '📜' },
    { id: 'agents' as const, label: 'Agents', icon: '🤖' },
    { id: 'fitness' as const, label: 'Fitness', icon: '💪' },
    { id: 'business' as const, label: 'Business', icon: '💼' },
    { id: 'usage' as const, label: 'Usage', icon: '📊' },
  ]

  return (
    <div className="min-h-screen p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-5xl lobster-float">🦞</span>
            <div>
              <h1 className="text-3xl font-bold">
                <span className="gradient-text">Mission Control</span>
              </h1>
              <p className="text-zinc-500 text-sm mt-1">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                <span className="mx-2">•</span>
                <span className="mono">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3">
              <div className="status-dot success" />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>System Online</span>
            </div>
            <button 
              onClick={toggleTheme}
              className="theme-toggle"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
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
          agents={agents} 
          projects={projects} 
          fitness={fitness}
          formatSchedule={formatSchedule}
          formatNextRun={formatNextRun}
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
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <CalendarGrid events={calendarEvents} />
          <CalendarTab events={calendarEvents} />
        </div>
      )}
      {activeTab === 'docs' && <DocsTab documents={documents} selectedDoc={selectedDoc} onSelect={loadDocument} onClose={() => setSelectedDoc(null)} />}
      {activeTab === 'tasks' && <TasksTab tasks={tasks} />}
      {activeTab === 'business' && <BusinessTab projects={projects} />}
      {activeTab === 'fitness' && <FitnessTab fitness={fitness} />}
      {activeTab === 'agents' && <AgentsTab agents={agents} cronJobs={cronJobs} formatSchedule={formatSchedule} />}
      {activeTab === 'usage' && <UsagePanel />}

      {/* Footer */}
      <footer className="mt-12 text-center">
        <p className="text-zinc-600 text-sm">
          <span className="lobster-float inline-block">🦞</span>
          <span className="mx-2">Max</span>
          <span className="text-zinc-700">•</span>
          <span className="mx-2">OpenClaw</span>
          <span className="text-zinc-700">•</span>
          <span className="mx-2 mono text-xs">{cronJobs.length} jobs active</span>
        </p>
      </footer>
    </div>
  )
}

// Overview Tab
function OverviewTab({ cronJobs, agents, projects, fitness, formatSchedule, formatNextRun, loading }: {
  cronJobs: CronJob[]
  agents: Agent[]
  projects: Project[]
  fitness: FitnessData
  formatSchedule: (s: unknown) => string
  formatNextRun: (job: CronJob) => string
  loading: boolean
}) {
  const activeJobs = cronJobs.filter(j => j.enabled !== false).length
  const activeAgents = agents.filter(a => a.status === 'active').length
  const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'building').length

  return (
    <div className="space-y-6">
      {/* Quick Stats - Auto-updating */}
      <QuickStats />

      {/* Activity Feed - Real-time updates */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <ActivityFeed limit={15} />
        </div>
        
        {/* System Health Quick View */}
        <div className="space-y-6">
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
                <span className="text-emerald-400 font-bold">{activeAgents}/{agents.length}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2">
                  <div className="status-dot success" />
                  <span className="text-sm font-semibold">Cron Jobs</span>
                </div>
                <span className="text-blue-400 font-bold">{activeJobs}/{cronJobs.length}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <div className="flex items-center gap-2">
                  <div className="status-dot success" />
                  <span className="text-sm font-semibold">Projects</span>
                </div>
                <span className="text-orange-400 font-bold">{activeProjects}</span>
              </div>
            </div>
          </div>

          {/* Fitness Quick View */}
          <div className="card">
            <div className="card-header">
              <span>💪</span> Fitness
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Weight</span>
                <span className="font-bold">{fitness.weight} lbs</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Body Fat</span>
                <span className="font-bold">{fitness.bodyFat}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Phase</span>
                <span className="badge badge-success text-xs">{fitness.phase}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Active Agents */}
        <div className="card">
          <div className="card-header">
            <span>🤖</span> Active Agents
          </div>
          <div className="space-y-3">
            {agents.map(agent => (
              <div key={agent.name} className="item-row">
                <div className="flex items-center gap-3">
                  <div className={`status-dot ${agent.status === 'active' ? 'success' : 'idle'}`} />
                  <div>
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-xs text-zinc-500">{agent.channel}</p>
                  </div>
                </div>
                <span className="badge badge-success">Online</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scheduled Jobs */}
        <div className="card">
          <div className="card-header">
            <span>⏰</span> Scheduled Jobs
          </div>
          {loading ? (
            <p className="text-zinc-500 text-sm">Loading...</p>
          ) : cronJobs.length === 0 ? (
            <p className="text-zinc-500 text-sm">No jobs scheduled</p>
          ) : (
            <div className="space-y-3">
              {cronJobs.slice(0, 4).map(job => (
                <div key={job.id} className="item-row">
                  <div>
                    <p className="font-medium text-sm">{job.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-orange-400">{formatNextRun(job)}</p>
                      <span className="text-zinc-600">•</span>
                      <p className="text-xs text-zinc-500 mono">{formatSchedule(job.schedule)}</p>
                    </div>
                  </div>
                  <div className={`status-dot ${job.enabled !== false ? 'success' : 'idle'}`} />
                </div>
              ))}
              {cronJobs.length > 4 && (
                <p className="text-xs text-zinc-500 text-center pt-2">+{cronJobs.length - 4} more</p>
              )}
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="card">
          <div className="card-header">
            <span>🚀</span> Projects
          </div>
          <div className="space-y-4">
            {projects.slice(0, 4).map(project => (
              <div key={project.name}>
                <div className="flex justify-between items-center mb-2">
                  <p className="font-medium text-sm">{project.name}</p>
                  <span className={`badge ${
                    project.status === 'live' ? 'badge-success' : 
                    project.status === 'building' ? 'badge-warning' : 'badge-neutral'
                  }`}>
                    {project.status}
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${project.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Today's Fitness */}
      <div className="card">
        <div className="card-header">
          <span>💪</span> Today's Progress
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-zinc-400">Calories</span>
              <span className="font-medium">{fitness.todayCalories || 0} / {fitness.caloriesTarget}</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${((fitness.todayCalories || 0) / fitness.caloriesTarget) * 100}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-zinc-400">Protein</span>
              <span className="font-medium">{fitness.todayProtein || 0}g / {fitness.proteinTarget}g</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${((fitness.todayProtein || 0) / fitness.proteinTarget) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Business Tab
function BusinessTab({ projects }: { projects: Project[] }) {
  // Client data - will be dynamic later
  const clients = [
    {
      id: 'maldo-distributors',
      name: 'Maldo Distributors',
      status: 'onboarding' as const,
      owner: "Jean's brother-in-law",
      location: 'Puerto Rico',
      business: 'Wholesale distribution (gas stations & colmados)',
      tier: 'Beta',
      mrr: 0,
      startDate: '2026-02-21',
      features: ['DealBot', 'Product tracking', 'WhatsApp']
    }
  ]
  
  const totalMRR = clients.reduce((sum, c) => sum + c.mrr, 0)
  const activeClients = clients.filter(c => c.status === 'active' || c.status === 'onboarding').length
  const pipelineValue = 150 // Potential from current lead

  const pricingTiers = [
    { name: 'Friends & Family', price: 50, features: ['Full agent access', 'Beta testing', 'Direct support'] },
    { name: 'Early Adopter', price: 150, features: ['Full agent access', 'Priority support', 'Custom integrations'] },
    { name: 'Standard', price: 300, features: ['Full agent access', '24/7 support', 'All integrations', 'Custom training'] }
  ]

  return (
    <div className="space-y-6">
      {/* Revenue Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="💰" label="MRR" value={`$${totalMRR}`} subtext="monthly recurring" />
        <StatCard icon="👥" label="Clients" value={activeClients} subtext="onboarding" />
        <StatCard icon="📥" label="Pipeline" value={`$${pipelineValue}`} subtext="potential MRR" />
        <StatCard icon="🎯" label="Goal" value="$10K" subtext="/month" />
      </div>

      {/* Active Clients */}
      <div className="card">
        <div className="card-header">
          <span>👥</span> Clients
        </div>
        <div className="space-y-4">
          {clients.map(client => (
            <div key={client.id} className="item-row">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <p className="font-medium">{client.name}</p>
                  <span className={`badge ${
                    client.status === 'active' ? 'badge-success' : 
                    client.status === 'onboarding' ? 'badge-warning' : 'badge-neutral'
                  }`}>
                    {client.status}
                  </span>
                  <span className="badge badge-neutral">{client.tier}</span>
                </div>
                <p className="text-sm text-zinc-500 mb-2">{client.business}</p>
                <p className="text-sm text-zinc-600">📍 {client.location} • 👤 {client.owner}</p>
                <div className="flex gap-2 mt-2">
                  {client.features.map(f => (
                    <span key={f} className="text-xs px-2 py-1 bg-zinc-800 rounded">{f}</span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">${client.mrr}</p>
                <p className="text-sm text-zinc-500">/month</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing Tiers */}
      <div className="card">
        <div className="card-header">
          <span>💳</span> Pricing Tiers
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {pricingTiers.map(tier => (
            <div key={tier.name} className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="font-medium mb-1">{tier.name}</p>
              <p className="text-2xl font-bold text-orange-500 mb-3">${tier.price}<span className="text-sm text-zinc-500">/mo</span></p>
              <ul className="text-sm text-zinc-400 space-y-1">
                {tier.features.map(f => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Projects Detail */}
      <div className="card">
        <div className="card-header">
          <span>🚀</span> Projects
        </div>
        <div className="space-y-4">
          {projects.map(project => (
            <div key={project.name} className="item-row">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <p className="font-medium">{project.name}</p>
                  <span className={`badge ${
                    project.status === 'live' ? 'badge-success' : 
                    project.status === 'building' ? 'badge-warning' : 'badge-neutral'
                  }`}>
                    {project.status}
                  </span>
                </div>
                {project.description && (
                  <p className="text-sm text-zinc-500 mb-3">{project.description}</p>
                )}
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${project.progress}%` }} />
                </div>
              </div>
              <span className="text-2xl font-bold text-zinc-600 ml-4">{project.progress}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hardware */}
      <div className="card">
        <div className="card-header">
          <span>🖥️</span> Infrastructure
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 bg-zinc-800/50 rounded-lg">
            <p className="font-medium mb-2">💻 MacBook Pro</p>
            <p className="text-sm text-zinc-400">Current host • Running OpenClaw</p>
            <span className="badge badge-success mt-2">Active</span>
          </div>
          <div className="p-4 bg-zinc-800/50 rounded-lg border-dashed border border-zinc-600">
            <p className="font-medium mb-2">🖥️ Mac Mini</p>
            <p className="text-sm text-zinc-400">Arriving next week • Will host client agents</p>
            <span className="badge badge-neutral mt-2">Pending</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Fitness Tab
function FitnessTab({ fitness }: { fitness: FitnessData }) {
  const bodyFatProgress = ((25 - fitness.bodyFat) / 10) * 100 // Goal: 15%

  return (
    <div className="space-y-6">
      {/* Body Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="⚖️" label="Weight" value={fitness.weight} unit="lbs" subtext={fitness.phase} />
        <StatCard icon="📉" label="Body Fat" value={fitness.bodyFat} unit="%" subtext="goal: 15%" />
        <StatCard icon="💪" label="Muscle" value={fitness.muscleMass} unit="lbs" subtext="lean mass" />
        <StatCard icon="🔥" label="BMR" value="1,746" unit="kcal" subtext="daily burn" />
      </div>

      {/* Today's Macros */}
      <div className="card">
        <div className="card-header">
          <span>🍽️</span> Today's Nutrition
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-zinc-400 text-sm">Calories</p>
                <p className="text-3xl font-bold">{fitness.todayCalories || 0}</p>
              </div>
              <p className="text-zinc-500">/ {fitness.caloriesTarget}</p>
            </div>
            <div className="progress-bar h-3">
              <div className="progress-fill" style={{ width: `${Math.min(((fitness.todayCalories || 0) / fitness.caloriesTarget) * 100, 100)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-zinc-400 text-sm">Protein</p>
                <p className="text-3xl font-bold">{fitness.todayProtein || 0}g</p>
              </div>
              <p className="text-zinc-500">/ {fitness.proteinTarget}g</p>
            </div>
            <div className="progress-bar h-3">
              <div className="progress-fill" style={{ width: `${Math.min(((fitness.todayProtein || 0) / fitness.proteinTarget) * 100, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Phase Info */}
      <div className="card accent-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-orange-400 uppercase tracking-wider font-medium">Current Phase</p>
            <p className="text-2xl font-bold mt-1">{fitness.phase}</p>
            <p className="text-zinc-500 text-sm mt-1">Cut starts ~March 23, 2026</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-zinc-400">Body Fat Progress</p>
            <p className="text-3xl font-bold gradient-text">{Math.round(bodyFatProgress)}%</p>
            <p className="text-xs text-zinc-500">to goal</p>
          </div>
        </div>
      </div>

      {/* Dashboard Link */}
      <a 
        href="https://fitness-dashboard-vite.onrender.com" 
        target="_blank" 
        rel="noopener noreferrer"
        className="card block hover:scale-[1.02] transition-transform"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-3xl">📊</span>
            <div>
              <p className="font-medium">Full Fitness Dashboard</p>
              <p className="text-sm text-zinc-500">Detailed charts, history, and more</p>
            </div>
          </div>
          <span className="text-2xl">→</span>
        </div>
      </a>
    </div>
  )
}

// Agents Tab
function AgentsTab({ agents, cronJobs, formatSchedule }: { 
  agents: Agent[]
  cronJobs: CronJob[]
  formatSchedule: (s: unknown) => string
}) {
  return (
    <div className="space-y-6">
      {/* Agent Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {agents.map(agent => (
          <div key={agent.name} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                  agent.status === 'active' ? 'bg-emerald-500/20' : 'bg-zinc-700/50'
                }`}>
                  {agent.name === 'Fitness Coach' ? '🏋️' : '🎯'}
                </div>
                <div>
                  <p className="font-semibold text-lg">{agent.name}</p>
                  <p className="text-sm text-zinc-500">{agent.channel}</p>
                </div>
              </div>
              <span className={`badge ${agent.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                {agent.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-800">
              <div>
                <p className="text-xs text-zinc-500">Missions</p>
                <p className="text-xl font-bold">{agent.missionsCompleted || 0}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Status</p>
                <p className="text-sm font-medium text-emerald-400">Running</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* All Cron Jobs */}
      <div className="card">
        <div className="card-header">
          <span>⏰</span> All Scheduled Jobs
        </div>
        <div className="space-y-2">
          {cronJobs.map(job => (
            <div key={job.id} className="item-row">
              <div className="flex items-center gap-3">
                <div className={`status-dot ${job.enabled !== false ? 'success' : 'idle'}`} />
                <div>
                  <p className="font-medium">{job.name}</p>
                  <p className="text-xs text-zinc-500 mono">{formatSchedule(job.schedule)}</p>
                </div>
              </div>
              <div className="text-right">
                {job.state?.lastStatus && (
                  <span className={`badge ${job.state.lastStatus === 'ok' ? 'badge-success' : 'badge-danger'}`}>
                    {job.state.lastStatus}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Calendar Tab
function CalendarTab({ events }: { events: CalendarEvent[] }) {
  const now = new Date()
  const upcoming = events.filter(e => new Date(e.time) > now)
  const past = events.filter(e => new Date(e.time) <= now)

  const formatEventTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div className="space-y-6">
      {/* Upcoming */}
      <div className="card">
        <div className="card-header">
          <span>⏰</span> Upcoming Tasks
        </div>
        {upcoming.length === 0 ? (
          <p className="text-zinc-500 text-sm">No upcoming tasks scheduled</p>
        ) : (
          <div className="space-y-3">
            {upcoming.slice(0, 10).map(event => (
              <div key={event.id} className="item-row">
                <div className="flex items-center gap-3">
                  <div className="status-dot warning" />
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs text-zinc-500 mono">{formatEventTime(event.time)}</p>
                  </div>
                </div>
                {event.schedule && (
                  <span className="badge badge-neutral mono text-xs">{event.schedule}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past / Completed */}
      <div className="card">
        <div className="card-header">
          <span>✅</span> Recently Completed
        </div>
        {past.length === 0 ? (
          <p className="text-zinc-500 text-sm">No completed tasks yet</p>
        ) : (
          <div className="space-y-3">
            {past.slice(0, 15).map(event => (
              <div key={event.id} className="item-row">
                <div className="flex items-center gap-3">
                  <div className={`status-dot ${event.type === 'error' ? 'danger' : 'success'}`} />
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs text-zinc-500 mono">{formatEventTime(event.time)}</p>
                  </div>
                </div>
                <span className={`badge ${event.type === 'error' ? 'badge-danger' : 'badge-success'}`}>
                  {event.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Docs Tab
function DocsTab({ documents, selectedDoc, onSelect, onClose }: { 
  documents: Document[]
  selectedDoc: DocumentContent | null
  onSelect: (path: string) => void
  onClose: () => void
}) {
  // Group by category
  const grouped = documents.reduce((acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = []
    acc[doc.category].push(doc)
    return acc
  }, {} as Record<string, Document[]>)

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Simple markdown-ish rendering
  const renderContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      // Headers
      if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold text-white mt-6 mb-3">{line.slice(2)}</h1>
      if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-bold text-orange-400 mt-5 mb-2">{line.slice(3)}</h2>
      if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-semibold text-zinc-200 mt-4 mb-2">{line.slice(4)}</h3>
      // List items
      if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 text-zinc-300">{line.slice(2)}</li>
      // Blockquote
      if (line.startsWith('> ')) return <blockquote key={i} className="border-l-4 border-orange-500 pl-4 italic text-zinc-400 my-2">{line.slice(2)}</blockquote>
      // Code block markers
      if (line.startsWith('```')) return <hr key={i} className="border-zinc-700 my-2" />
      // Empty line
      if (line.trim() === '') return <br key={i} />
      // Regular text
      return <p key={i} className="text-zinc-300 leading-relaxed">{line}</p>
    })
  }

  if (selectedDoc) {
    return (
      <div className="space-y-4">
        <button 
          onClick={onClose}
          className="flex items-center gap-2 text-orange-400 hover:text-orange-300 transition-colors font-medium"
        >
          <span>←</span> Back to documents
        </button>
        <div className="card">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-700">
            <div>
              <h2 className="text-xl font-bold text-white">{selectedDoc.name}</h2>
              <p className="text-sm text-zinc-400 mt-1">{selectedDoc.path}</p>
            </div>
            <div className="text-right text-sm text-zinc-400">
              <p>{formatSize(selectedDoc.size)}</p>
              <p>{formatDate(selectedDoc.modified)}</p>
            </div>
          </div>
          <div className="bg-zinc-900/70 rounded-xl p-6 max-h-[70vh] overflow-y-auto">
            {selectedDoc.name.endsWith('.json') ? (
              <pre className="text-sm font-mono text-emerald-400 whitespace-pre-wrap">
                {selectedDoc.content}
              </pre>
            ) : (
              <div className="prose-custom">
                {renderContent(selectedDoc.content)}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, docs]) => (
        <div key={category} className="card">
          <div className="card-header">
            <span>{category.includes('Agent') ? '🤖' : category === 'Memory' ? '🧠' : '📄'}</span> 
            {category}
          </div>
          <div className="space-y-2">
            {docs.map(doc => (
              <div 
                key={doc.path} 
                className="item-row cursor-pointer"
                onClick={() => onSelect(doc.path)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {doc.type === 'markdown' ? '📝' : doc.type === 'json' ? '📊' : '📄'}
                  </span>
                  <div>
                    <p className="font-medium">{doc.name}</p>
                    <p className="text-xs text-zinc-500">{formatDate(doc.modified)}</p>
                  </div>
                </div>
                <span className="text-sm text-zinc-500">{formatSize(doc.size)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Tasks Tab
function TasksTab({ tasks }: { tasks: TaskLog[] }) {
  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return d.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const successCount = tasks.filter(t => t.result === 'success').length
  const errorCount = tasks.filter(t => t.result === 'error').length

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon="📋" label="Total Tasks" value={tasks.length} subtext="logged" />
        <StatCard icon="✅" label="Successful" value={successCount} subtext={`${Math.round((successCount / tasks.length) * 100 || 0)}%`} />
        <StatCard icon="❌" label="Errors" value={errorCount} subtext={`${Math.round((errorCount / tasks.length) * 100 || 0)}%`} />
      </div>

      {/* Task List */}
      <div className="card">
        <div className="card-header">
          <span>📜</span> Task History
        </div>
        {tasks.length === 0 ? (
          <p className="text-zinc-500 text-sm">No tasks logged yet</p>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => (
              <div key={task.id} className="item-row">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`status-dot ${
                    task.result === 'success' ? 'success' : 
                    task.result === 'error' ? 'danger' : 'warning'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{task.action}</p>
                    {task.details && (
                      <p className="text-xs text-zinc-500 truncate">{task.details}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-zinc-400">{formatTime(task.timestamp)}</p>
                  {task.source && (
                    <span className="badge badge-neutral text-xs">{task.source}</span>
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

// Stat Card Component
function StatCard({ icon, label, value, subtext, unit }: { 
  icon: string
  label: string
  value: string | number
  subtext: string
  unit?: string
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="stat-value">{value}</span>
        {unit && <span className="text-zinc-500 text-sm">{unit}</span>}
      </div>
      <p className="text-xs text-zinc-500 mt-1">{subtext}</p>
    </div>
  )
}

export default App
