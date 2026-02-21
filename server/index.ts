import express from 'express'
import cors from 'cors'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname, extname, basename } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const execAsync = promisify(exec)
const app = express()
const PORT = process.env.PORT || 3002
const isProduction = process.env.NODE_ENV === 'production'

app.use(cors())
app.use(express.json())

const DATA_DIR = join(__dirname, '../data')
const TASKS_FILE = join(DATA_DIR, 'tasks.json')
const BOARD_FILE = join(DATA_DIR, 'board.json')
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/Users/jeanseda/.openclaw/workspace'

// Serve static files in production
if (isProduction) {
  const distPath = join(__dirname, '../dist')
  app.use(express.static(distPath))
}

// Serve data files (for claude-usage.json, etc.)
app.use('/data', express.static(DATA_DIR))

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

// Initialize tasks file if not exists
if (!existsSync(TASKS_FILE)) {
  writeFileSync(TASKS_FILE, '[]')
}

// Initialize board file if not exists
if (!existsSync(BOARD_FILE)) {
  const defaultBoard = [
    { id: '1', title: 'Set up DealBot WhatsApp', description: 'Verify phone number and connect to OpenClaw', status: 'todo', priority: 'high', tags: ['dealbot'] },
    { id: '2', title: 'Design agent for Vic', description: 'Complete onboarding curriculum', status: 'in_progress', priority: 'medium', tags: ['agents'] },
    { id: '3', title: 'Fitness Dashboard improvements', description: 'Add meal logging feature', status: 'backlog', priority: 'low', tags: ['fitness'] },
    { id: '4', title: 'Mission Control calendar', description: 'Implement classic calendar view', status: 'done', priority: 'medium', tags: ['dashboard'] },
  ]
  writeFileSync(BOARD_FILE, JSON.stringify(defaultBoard, null, 2))
}

// ═══════════════════════════════════════════════════════════
// CRON JOBS
// ═══════════════════════════════════════════════════════════

app.get('/api/cron', async (req, res) => {
  try {
    const { stdout } = await execAsync('openclaw cron list --json 2>/dev/null || echo "[]"')
    const jobs = JSON.parse(stdout.trim() || '[]')
    res.json(jobs)
  } catch (e) {
    console.error('Failed to get cron jobs:', e)
    res.json([])
  }
})

// ═══════════════════════════════════════════════════════════
// CALENDAR - Scheduled & Past Tasks
// ═══════════════════════════════════════════════════════════

app.get('/api/calendar', async (req, res) => {
  try {
    // Get cron jobs with their schedules and last/next run times
    const { stdout } = await execAsync('openclaw cron list --json 2>/dev/null || echo "[]"')
    const parsed = JSON.parse(stdout.trim() || '[]')
    const jobs = Array.isArray(parsed) ? parsed : (parsed?.jobs || [])
    
    const events: Array<{
      id: string
      title: string
      type: 'scheduled' | 'completed' | 'error'
      time: string
      schedule?: string
    }> = []

    // Add upcoming scheduled runs
    for (const job of jobs) {
      if (job.state?.nextRunAtMs) {
        events.push({
          id: `next-${job.id}`,
          title: job.name || job.id,
          type: 'scheduled',
          time: new Date(job.state.nextRunAtMs).toISOString(),
          schedule: job.schedule?.expr || job.schedule
        })
      }
      
      // Add last run if exists
      if (job.state?.lastRunAtMs) {
        events.push({
          id: `last-${job.id}`,
          title: job.name || job.id,
          type: job.state.lastStatus === 'error' ? 'error' : 'completed',
          time: new Date(job.state.lastRunAtMs).toISOString()
        })
      }
    }

    // Sort by time
    events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    
    res.json(events)
  } catch (e) {
    console.error('Failed to get calendar:', e)
    res.json([])
  }
})

// ═══════════════════════════════════════════════════════════
// DOCUMENTS - Workspace Files
// ═══════════════════════════════════════════════════════════

app.get('/api/documents', (req, res) => {
  try {
    const docs: Array<{
      name: string
      path: string
      type: 'markdown' | 'json' | 'other'
      size: number
      modified: string
      category: string
    }> = []

    // Key files to show
    const keyFiles = [
      { path: 'MEMORY.md', category: 'Core' },
      { path: 'SOUL.md', category: 'Core' },
      { path: 'USER.md', category: 'Core' },
      { path: 'AGENTS.md', category: 'Core' },
      { path: 'TOOLS.md', category: 'Core' },
      { path: 'HEARTBEAT.md', category: 'Core' },
    ]

    // Add key files
    for (const file of keyFiles) {
      const fullPath = join(WORKSPACE, file.path)
      if (existsSync(fullPath)) {
        const stat = statSync(fullPath)
        docs.push({
          name: file.path,
          path: file.path,
          type: extname(file.path) === '.md' ? 'markdown' : extname(file.path) === '.json' ? 'json' : 'other',
          size: stat.size,
          modified: stat.mtime.toISOString(),
          category: file.category
        })
      }
    }

    // Add memory files (all of them, we'll limit after sorting)
    const memoryDir = join(WORKSPACE, 'memory')
    if (existsSync(memoryDir)) {
      const memoryFiles = readdirSync(memoryDir).filter(f => f.endsWith('.md') || f.endsWith('.json'))
      for (const file of memoryFiles) {
        const fullPath = join(memoryDir, file)
        if (existsSync(fullPath)) {
          const stat = statSync(fullPath)
          docs.push({
            name: file,
            path: `memory/${file}`,
            type: extname(file) === '.md' ? 'markdown' : 'json',
            size: stat.size,
            modified: stat.mtime.toISOString(),
            category: 'Memory'
          })
        }
      }
    }

    // Add agent configs
    const agentsDir = join(WORKSPACE, 'agents')
    if (existsSync(agentsDir)) {
      const agentDirs = readdirSync(agentsDir)
      for (const agentDir of agentDirs) {
        const agentPath = join(agentsDir, agentDir)
        if (statSync(agentPath).isDirectory()) {
          const agentFiles = readdirSync(agentPath).filter(f => f.endsWith('.md') || f.endsWith('.json'))
          for (const file of agentFiles) {
            const fullPath = join(agentPath, file)
            const stat = statSync(fullPath)
            docs.push({
              name: `${agentDir}/${file}`,
              path: `agents/${agentDir}/${file}`,
              type: extname(file) === '.md' ? 'markdown' : 'json',
              size: stat.size,
              modified: stat.mtime.toISOString(),
              category: `Agent: ${agentDir}`
            })
          }
        }
      }
    }

    // Sort by modified date descending and limit to 50 most recent
    docs.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
    const recentDocs = docs.slice(0, 50)
    
    res.json(recentDocs)
  } catch (e) {
    console.error('Failed to get documents:', e)
    res.json([])
  }
})

// Read a specific document
app.get('/api/documents/:path(*)', (req, res) => {
  try {
    const docPath = req.params.path
    const fullPath = join(WORKSPACE, docPath)
    
    // Security: make sure path is within workspace
    if (!fullPath.startsWith(WORKSPACE)) {
      return res.status(403).json({ error: 'Access denied' })
    }
    
    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: 'Document not found' })
    }
    
    const content = readFileSync(fullPath, 'utf-8')
    const stat = statSync(fullPath)
    
    res.json({
      path: docPath,
      name: basename(docPath),
      content,
      size: stat.size,
      modified: stat.mtime.toISOString()
    })
  } catch (e) {
    console.error('Failed to read document:', e)
    res.status(500).json({ error: 'Failed to read document' })
  }
})

// ═══════════════════════════════════════════════════════════
// TASK HISTORY - Completed Tasks Log
// ═══════════════════════════════════════════════════════════

app.get('/api/tasks', async (req, res) => {
  try {
    // Get local tasks
    const localTasks = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'))
    
    // Get cron job history from their state
    const { stdout } = await execAsync('openclaw cron list --json 2>/dev/null || echo "[]"')
    const parsed = JSON.parse(stdout.trim() || '[]')
    const jobs = Array.isArray(parsed) ? parsed : (parsed?.jobs || [])
    
    const cronTasks = jobs
      .filter((j: any) => j.state?.lastRunAtMs)
      .map((j: any) => ({
        id: `cron-${j.id}-${j.state.lastRunAtMs}`,
        timestamp: new Date(j.state.lastRunAtMs).toISOString(),
        action: j.name || j.id,
        result: j.state.lastStatus === 'error' ? 'error' : 'success',
        details: j.state.lastError || `Completed in ${j.state.lastDurationMs}ms`,
        source: 'cron'
      }))
    
    // Combine and sort
    const allTasks = [...localTasks, ...cronTasks]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50) // Last 50
    
    res.json(allTasks)
  } catch (e) {
    console.error('Failed to get tasks:', e)
    res.json([])
  }
})

// Add task log entry
app.post('/api/tasks', (req, res) => {
  try {
    const tasks = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'))
    const newTask = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...req.body
    }
    tasks.push(newTask)
    writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2))
    res.json(newTask)
  } catch (e) {
    res.status(500).json({ error: 'Failed to add task' })
  }
})

// ═══════════════════════════════════════════════════════════
// FITNESS
// ═══════════════════════════════════════════════════════════

app.get('/api/fitness', async (req, res) => {
  try {
    const memoryPath = join(WORKSPACE, 'MEMORY.md')
    const memory = readFileSync(memoryPath, 'utf-8')
    
    const weightMatch = memory.match(/Weight:\s*([\d.]+)\s*lbs/i)
    const bodyFatMatch = memory.match(/Body Fat:\s*([\d.]+)%/i)
    const muscleMassMatch = memory.match(/Muscle Mass:\s*([\d.]+)\s*lbs/i)
    
    res.json({
      weight: weightMatch ? parseFloat(weightMatch[1]) : 164.9,
      bodyFat: bodyFatMatch ? parseFloat(bodyFatMatch[1]) : 19.8,
      muscleMass: muscleMassMatch ? parseFloat(muscleMassMatch[1]) : 125.6,
      phase: 'Lean Bulk',
      caloriesTarget: 2800,
      proteinTarget: 170
    })
  } catch (e) {
    res.json({
      weight: 164.9,
      bodyFat: 19.8,
      muscleMass: 125.6,
      phase: 'Lean Bulk',
      caloriesTarget: 2800,
      proteinTarget: 170
    })
  }
})

// ═══════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════

app.get('/api/projects', (req, res) => {
  res.json([
    { name: 'DealBot', status: 'building', progress: 45, description: 'WhatsApp price tracker' },
    { name: 'Fitness Dashboard', status: 'live', progress: 100, description: 'Notion-powered fitness' },
    { name: 'Mission Control', status: 'building', progress: 70, description: 'This dashboard' },
    { name: 'AI Agents Business', status: 'active', progress: 15, description: '$10K/month goal' },
  ])
})

// ═══════════════════════════════════════════════════════════
// KANBAN BOARD
// ═══════════════════════════════════════════════════════════

app.get('/api/board', (req, res) => {
  try {
    const board = JSON.parse(readFileSync(BOARD_FILE, 'utf-8'))
    res.json(board)
  } catch (e) {
    res.json([])
  }
})

app.post('/api/board', (req, res) => {
  try {
    const board = JSON.parse(readFileSync(BOARD_FILE, 'utf-8'))
    const newTask = {
      id: Date.now().toString(),
      ...req.body
    }
    board.push(newTask)
    writeFileSync(BOARD_FILE, JSON.stringify(board, null, 2))
    res.json(newTask)
  } catch (e) {
    res.status(500).json({ error: 'Failed to add task' })
  }
})

app.patch('/api/board/:id', (req, res) => {
  try {
    const board = JSON.parse(readFileSync(BOARD_FILE, 'utf-8'))
    const taskIndex = board.findIndex((t: any) => t.id === req.params.id)
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' })
    }
    board[taskIndex] = { ...board[taskIndex], ...req.body }
    writeFileSync(BOARD_FILE, JSON.stringify(board, null, 2))
    res.json(board[taskIndex])
  } catch (e) {
    res.status(500).json({ error: 'Failed to update task' })
  }
})

app.delete('/api/board/:id', (req, res) => {
  try {
    let board = JSON.parse(readFileSync(BOARD_FILE, 'utf-8'))
    board = board.filter((t: any) => t.id !== req.params.id)
    writeFileSync(BOARD_FILE, JSON.stringify(board, null, 2))
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ═══════════════════════════════════════════════════════════
// USAGE TRACKING
// ═══════════════════════════════════════════════════════════

const USAGE_FILE = join(DATA_DIR, 'usage.json')

// Initialize usage file if not exists
if (!existsSync(USAGE_FILE)) {
  writeFileSync(USAGE_FILE, JSON.stringify({
    daily: [],
    totals: { tokensIn: 0, tokensOut: 0, sessions: 0, cronRuns: 0 },
    lastUpdated: new Date().toISOString()
  }, null, 2))
}

// Get usage stats
app.get('/api/usage', async (req, res) => {
  try {
    // Read local usage tracking
    const usage = JSON.parse(readFileSync(USAGE_FILE, 'utf-8'))
    
    // Try to get cron job stats
    let cronStats = { total: 0, successful: 0, failed: 0 }
    try {
      const cronRes = await fetch('http://localhost:18789/api/cron', {
        headers: { 'Authorization': `Bearer ${process.env.OPENCLAW_TOKEN || ''}` }
      })
      if (cronRes.ok) {
        const cronData = await cronRes.json()
        const jobs = cronData.jobs || []
        cronStats.total = jobs.length
        cronStats.successful = jobs.filter((j: any) => j.state?.lastStatus === 'ok').length
        cronStats.failed = jobs.filter((j: any) => j.state?.lastStatus === 'error').length
      }
    } catch (e) {
      // Gateway not available, skip
    }

    // Calculate cost estimates (approximate)
    const costs = {
      opus: { input: 15, output: 75 }, // per million tokens
      sonnet: { input: 3, output: 15 }
    }
    
    const estimatedCost = (
      (usage.totals.tokensIn / 1000000) * costs.sonnet.input +
      (usage.totals.tokensOut / 1000000) * costs.sonnet.output
    ).toFixed(4)

    res.json({
      ...usage,
      cronStats,
      estimatedCost: parseFloat(estimatedCost),
      models: {
        conversations: 'claude-opus-4-5-20251101',
        cronJobs: 'claude-sonnet-4-5-20250929'
      }
    })
  } catch (e) {
    res.status(500).json({ error: 'Failed to get usage' })
  }
})

// Log usage (called by agents after work)
app.post('/api/usage/log', (req, res) => {
  try {
    const { tokensIn, tokensOut, type, description } = req.body
    const usage = JSON.parse(readFileSync(USAGE_FILE, 'utf-8'))
    
    const today = new Date().toISOString().split('T')[0]
    let dayEntry = usage.daily.find((d: any) => d.date === today)
    
    if (!dayEntry) {
      dayEntry = { date: today, tokensIn: 0, tokensOut: 0, sessions: 0, cronRuns: 0, logs: [] }
      usage.daily.push(dayEntry)
    }
    
    dayEntry.tokensIn += tokensIn || 0
    dayEntry.tokensOut += tokensOut || 0
    if (type === 'cron') dayEntry.cronRuns++
    if (type === 'session') dayEntry.sessions++
    
    dayEntry.logs.push({
      time: new Date().toISOString(),
      type,
      description,
      tokensIn,
      tokensOut
    })
    
    // Update totals
    usage.totals.tokensIn += tokensIn || 0
    usage.totals.tokensOut += tokensOut || 0
    if (type === 'cron') usage.totals.cronRuns++
    if (type === 'session') usage.totals.sessions++
    
    usage.lastUpdated = new Date().toISOString()
    
    // Keep only last 30 days
    usage.daily = usage.daily.slice(-30)
    
    writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2))
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Failed to log usage' })
  }
})

// Catch-all route for SPA (production only)
if (isProduction) {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`🦞 Mission Control ${isProduction ? '(production)' : '(dev)'} running on http://localhost:${PORT}`)
})
