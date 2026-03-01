import cors from 'cors'
import express from 'express'
import os from 'os'
import { exec as execCallback } from 'child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, extname, join } from 'path'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const execAsync = promisify(execCallback)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = 3002

const WORKSPACE_PATH = '/Users/jeanseda/.openclaw/workspace'
const GEO_AUDIT_PATH = '/Users/jeanseda/.openclaw/workspace/geo-audit'
const GEO_AUDIT_DATA_PATH = '/Users/jeanseda/.openclaw/workspace/geo-audit/data'
const PAYMENTS_PATH = '/Users/jeanseda/.openclaw/workspace/geo-audit/data/payments.json'
const LEADS_PATH = '/Users/jeanseda/.openclaw/workspace/geo-audit/data/leads.json'
const AUDITS_PATH = '/Users/jeanseda/.openclaw/workspace/geo-audit/data/cache/ai-audits'
const DRAFTS_PATH = '/Users/jeanseda/.openclaw/workspace/drafts'
const OPENCLAW_HOME = '/Users/jeanseda/.openclaw'
const OPENCLAW_LOGS_PATH = '/Users/jeanseda/.openclaw/logs'
const CRON_JOBS_PATH = '/Users/jeanseda/.openclaw/cron/jobs.json'
const LOCAL_AGENTS_PATH = join(__dirname, '../data/agents.json')
const PUBLIC_AGENTS_PATH = join(__dirname, '../public/data/agents.json')

app.use(cors())
app.use(express.json())

const distPath = join(__dirname, '../dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
}

type JsonObject = Record<string, unknown>

type AuditSummary = {
  id: string
  businessName: string
  score: number
  timestamp: string
}

type CronStatus = 'ok' | 'error' | 'running' | 'idle' | 'disabled'

type AgentSeed = {
  id: string
  agentId?: string
  name?: string
  role?: string
  model?: string
  status?: 'active' | 'idle'
  uptimeHours?: number
}

const readJsonFile = <T>(filePath: string, fallback: T): T => {
  if (!existsSync(filePath)) return fallback

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return fallback
  }
}

const toIso = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }

  if (typeof value === 'string' && value.trim()) {
    const timestamp = Date.parse(value)
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp).toISOString()
    }
  }

  return null
}

const normalizeScore = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  const normalized = numeric <= 10 ? numeric * 10 : numeric
  return Math.max(0, Math.min(100, Math.round(normalized)))
}

const formatBytes = (bytes: number): number => {
  return Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10
}

const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const startOfToday = (): Date => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const startOfWeek = (): Date => {
  const today = startOfToday()
  const day = today.getDay()
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - day)
}

const startOfMonth = (): Date => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

const safeExec = async (command: string): Promise<{ stdout: string; stderr: string; ok: boolean }> => {
  try {
    const result = await execAsync(command, { timeout: 15_000, maxBuffer: 1024 * 1024 * 4 })
    return { stdout: result.stdout, stderr: result.stderr, ok: true }
  } catch (error: any) {
    return {
      stdout: error?.stdout ?? '',
      stderr: error?.stderr ?? error?.message ?? '',
      ok: false
    }
  }
}

const fetchBoolean = async (url: string): Promise<boolean> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4_000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

const loadPayments = (): Array<Record<string, unknown>> => {
  const raw = readJsonFile<JsonObject>(PAYMENTS_PATH, {})
  const payments = Array.isArray(raw.payments) ? raw.payments : []
  return payments.filter((payment): payment is Record<string, unknown> => Boolean(payment && typeof payment === 'object'))
}

const loadLeads = (): Array<Record<string, unknown>> => {
  const raw = readJsonFile<JsonObject>(LEADS_PATH, {})
  const leads = Array.isArray(raw.leads) ? raw.leads : []
  return leads.filter((lead): lead is Record<string, unknown> => Boolean(lead && typeof lead === 'object'))
}

const loadAuditSummaries = (): AuditSummary[] => {
  if (!existsSync(AUDITS_PATH)) return []

  return readdirSync(AUDITS_PATH)
    .filter((fileName) => extname(fileName) === '.json')
    .map((fileName) => {
      const filePath = join(AUDITS_PATH, fileName)
      const stats = statSync(filePath)
      const raw = readJsonFile<JsonObject>(filePath, {})
      const report = (raw.report ?? {}) as JsonObject
      const reportBusiness = (report.business ?? {}) as JsonObject

      const timestamp =
        toIso(raw.timestamp) ||
        toIso(report.timestamp) ||
        stats.mtime.toISOString()

      return {
        id: String(raw.cacheId ?? fileName.replace(/\.json$/, '')),
        businessName: String(
          report.businessName ??
            reportBusiness.name ??
            raw.businessName ??
            fileName.replace(/\.json$/, '')
        ),
        score: normalizeScore(
          report.overallScore ??
            (report.score as JsonObject | undefined)?.overall ??
            raw.score
        ),
        timestamp
      }
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
}

const normalizeCronStatus = (job: Record<string, unknown>): CronStatus => {
  if (job.enabled === false) return 'disabled'

  const state = (job.state ?? {}) as JsonObject
  if (typeof state.runningAtMs === 'number') return 'running'

  const lastStatus = String(state.lastStatus ?? state.lastRunStatus ?? '').toLowerCase()
  if (['ok', 'success', 'completed'].includes(lastStatus)) return 'ok'
  if (['error', 'failed', 'timeout'].includes(lastStatus)) return 'error'

  return 'idle'
}

const readCronJobsFallback = (): Array<Record<string, unknown>> => {
  const raw = readJsonFile<JsonObject>(CRON_JOBS_PATH, {})
  const jobs = Array.isArray(raw.jobs) ? raw.jobs : []
  return jobs.filter((job): job is Record<string, unknown> => Boolean(job && typeof job === 'object'))
}

const loadCronJobs = async () => {
  const cliResult = await safeExec('openclaw cron list --json')
  let jobs: Array<Record<string, unknown>> = []
  let source: 'cli' | 'file' = 'cli'

  if (cliResult.ok && cliResult.stdout.trim()) {
    try {
      const parsed = JSON.parse(cliResult.stdout) as JsonObject | Array<Record<string, unknown>>
      jobs = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as JsonObject).jobs)
          ? (((parsed as JsonObject).jobs as Array<unknown>).filter((job): job is Record<string, unknown> => Boolean(job && typeof job === 'object')))
          : []
    } catch {
      jobs = []
    }
  }

  if (jobs.length === 0) {
    source = 'file'
    jobs = readCronJobsFallback()
  }

  const mapped = jobs.map((job) => {
    const state = (job.state ?? {}) as JsonObject
    return {
      id: String(job.id ?? ''),
      agentId: String(job.agentId ?? 'main'),
      name: String(job.name ?? job.id ?? 'Unnamed Job'),
      enabled: job.enabled !== false,
      schedule: job.schedule ?? null,
      status: normalizeCronStatus(job),
      lastRunAt: toIso(state.lastRunAtMs) ?? null,
      nextRunAt: toIso(state.nextRunAtMs) ?? null,
      lastDurationMs: typeof state.lastDurationMs === 'number' ? state.lastDurationMs : null,
      lastError: typeof state.lastError === 'string' ? state.lastError : null
    }
  })

  return {
    source,
    jobs: mapped,
    count: mapped.length
  }
}

const loadAgentSeeds = (): AgentSeed[] => {
  const fromPublic = readJsonFile<JsonObject>(PUBLIC_AGENTS_PATH, {})
  const fromLocal = readJsonFile<JsonObject>(LOCAL_AGENTS_PATH, fromPublic)
  const agents = Array.isArray(fromLocal.agents) ? fromLocal.agents : Array.isArray(fromPublic.agents) ? fromPublic.agents : []

  return agents.filter((agent): agent is AgentSeed => Boolean(agent && typeof agent === 'object' && 'id' in agent))
}

const loadAgents = async () => {
  const [cronPayload, activeSessions] = await Promise.all([loadCronJobs(), loadActiveSessions()])
  const seeds = loadAgentSeeds()

  const fallbackIds = Array.from(
    new Set(cronPayload.jobs.map((job) => String(job.agentId ?? 'main')))
  )

  const resolvedSeeds =
    seeds.length > 0
      ? seeds
      : fallbackIds.map((agentId) => ({
          id: agentId,
          agentId,
          name: agentId === 'main' ? 'Main Agent' : agentId,
          role: 'Automation Worker',
          model: 'Unknown',
          status: 'idle' as const,
          uptimeHours: 0
        }))

  const agents = resolvedSeeds.map((seed, index) => {
    const agentId = seed.agentId ?? seed.id
    const jobs = cronPayload.jobs.filter((job) => job.agentId === agentId)
    const runningJob = jobs.find((job) => job.status === 'running') ?? null
    const latestJob = [...jobs]
      .sort((a, b) => Date.parse(b.lastRunAt ?? '') - Date.parse(a.lastRunAt ?? ''))
      .find(Boolean) ?? null
    const latestTimestamp = latestJob?.lastRunAt ?? null
    const latestRunMs = latestTimestamp ? Date.parse(latestTimestamp) : 0
    const isFresh = latestRunMs > 0 && Date.now() - latestRunMs < 6 * 60 * 60 * 1000
    const progress = runningJob
      ? 72
      : latestJob?.status === 'ok'
        ? 100
        : latestJob?.status === 'error'
          ? 28
          : 12

    return {
      id: seed.id,
      agentId,
      name: seed.name ?? seed.id,
      role: seed.role ?? 'Automation Worker',
      model: seed.model ?? 'Unknown',
      uptimeHours: seed.uptimeHours ?? 0,
      status: runningJob || seed.status === 'active' || isFresh ? 'active' : 'idle',
      sessions: Math.max(1, Math.ceil(activeSessions / Math.max(1, resolvedSeeds.length)) + (index === 0 ? activeSessions % Math.max(1, resolvedSeeds.length) : 0)),
      currentTask: runningJob?.name ?? latestJob?.name ?? 'Awaiting next scheduled task',
      lastRunAt: latestTimestamp,
      nextRunAt: runningJob?.nextRunAt ?? latestJob?.nextRunAt ?? null,
      queueDepth: jobs.filter((job) => job.status === 'idle' || job.status === 'running').length,
      progress,
      lastStatus: runningJob?.status ?? latestJob?.status ?? 'idle'
    }
  })

  return {
    agents,
    count: agents.length,
    checkedAt: new Date().toISOString()
  }
}

const loadDiskUsage = async () => {
  const result = await safeExec(`df -k "${WORKSPACE_PATH}"`)
  const lines = result.stdout.trim().split('\n')
  const rawLine = lines[lines.length - 1] ?? ''
  const parts = rawLine.trim().split(/\s+/)

  if (parts.length < 5) {
    return {
      usedPercent: 0,
      usedGb: 0,
      totalGb: 0
    }
  }

  const totalKb = Number(parts[1]) || 0
  const usedKb = Number(parts[2]) || 0
  const usedPercent = Number((parts[4] ?? '0').replace('%', '')) || 0

  return {
    usedPercent,
    usedGb: Math.round((usedKb / 1024 / 1024) * 10) / 10,
    totalGb: Math.round((totalKb / 1024 / 1024) * 10) / 10
  }
}

const loadActiveSessions = async (): Promise<number> => {
  const result = await safeExec('openclaw sessions list --json')
  if (!result.ok || !result.stdout.trim()) return 0

  try {
    const parsed = JSON.parse(result.stdout) as JsonObject | Array<unknown>
    const sessions = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as JsonObject).sessions)
        ? ((parsed as JsonObject).sessions as Array<unknown>)
        : []
    return sessions.length
  } catch {
    return 0
  }
}

const countDraftFiles = (): number => {
  if (!existsSync(DRAFTS_PATH)) return 0

  return readdirSync(DRAFTS_PATH)
    .map((fileName) => join(DRAFTS_PATH, fileName))
    .filter((filePath) => {
      try {
        return statSync(filePath).isFile()
      } catch {
        return false
      }
    }).length
}

const loadRecentActivity = (): Array<{ source: string; timestamp: string | null; line: string }> => {
  if (!existsSync(OPENCLAW_LOGS_PATH)) return []

  const files = readdirSync(OPENCLAW_LOGS_PATH)
    .filter((fileName) => /\.(log|jsonl)$/i.test(fileName))
    .map((fileName) => {
      const filePath = join(OPENCLAW_LOGS_PATH, fileName)
      return {
        fileName,
        filePath,
        mtimeMs: statSync(filePath).mtimeMs
      }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  const entries: Array<{ source: string; timestamp: string | null; line: string }> = []

  for (const file of files) {
    const lines = readFileSync(file.filePath, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-50)

    for (const line of lines) {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T\S+)/)
      entries.push({
        source: file.fileName,
        timestamp: match ? toIso(match[1]) : null,
        line
      })
    }

    if (entries.length >= 75) break
  }

  return entries
    .sort((a, b) => {
      const left = a.timestamp ? Date.parse(a.timestamp) : 0
      const right = b.timestamp ? Date.parse(b.timestamp) : 0
      return left - right
    })
    .slice(-50)
}

app.get('/api/status', async (_req, res) => {
  const [gateway, ollama, whatsappProcess] = await Promise.all([
    fetchBoolean('http://127.0.0.1:18789'),
    fetchBoolean('http://localhost:11434/api/tags'),
    safeExec('pgrep -if openclaw')
  ])

  res.json({
    gateway,
    whatsapp: whatsappProcess.ok && Boolean(whatsappProcess.stdout.trim()),
    ollama,
    checkedAt: new Date().toISOString()
  })
})

app.get('/api/crons', async (_req, res) => {
  const payload = await loadCronJobs()
  res.json({
    ...payload,
    checkedAt: new Date().toISOString()
  })
})

app.get('/api/cron-status', async (_req, res) => {
  const payload = await loadCronJobs()
  res.json({
    ...payload,
    checkedAt: new Date().toISOString()
  })
})

app.get('/api/agents', async (_req, res) => {
  const payload = await loadAgents()
  res.json(payload)
})

app.get('/api/revenue', (_req, res) => {
  const payments = loadPayments()
  const today = startOfToday().getTime()
  const week = startOfWeek().getTime()
  const month = startOfMonth().getTime()

  let todayTotal = 0
  let weekTotal = 0
  let monthTotal = 0

  const normalizedPayments = payments
    .map((payment) => {
      const amount = Number(payment.amount ?? 0) || 0
      const timestamp = toIso(payment.timestamp)
      const businessName = String(payment.businessName ?? payment.email ?? 'Unknown')
      return { amount, timestamp, businessName }
    })
    .filter((payment) => payment.timestamp !== null)
    .sort((a, b) => Date.parse((b.timestamp as string)) - Date.parse((a.timestamp as string)))

  for (const payment of normalizedPayments) {
    const time = Date.parse(payment.timestamp as string)
    if (time >= today) todayTotal += payment.amount
    if (time >= week) weekTotal += payment.amount
    if (time >= month) monthTotal += payment.amount
  }

  res.json({
    today: todayTotal,
    week: weekTotal,
    month: monthTotal,
    payments: normalizedPayments.slice(0, 5),
    totalCount: normalizedPayments.length,
    sourcePath: PAYMENTS_PATH
  })
})

app.get('/api/audits', (_req, res) => {
  const audits = loadAuditSummaries()
  const today = startOfToday().getTime()

  res.json({
    total: audits.length,
    today: audits.filter((audit) => Date.parse(audit.timestamp) >= today).length,
    recent: audits.slice(0, 5),
    sourcePath: AUDITS_PATH
  })
})

app.get('/api/leads', (_req, res) => {
  const leads = loadLeads()
    .map((lead) => ({
      name: String((lead.name ?? lead.fullName ?? lead.businessName ?? lead.email ?? 'Lead') as string),
      email: String((lead.email ?? '') as string),
      source: String((lead.source ?? lead.channel ?? 'capture') as string),
      createdAt: toIso(lead.createdAt ?? lead.timestamp) ?? null
    }))
    .sort((a, b) => {
      const left = a.createdAt ? Date.parse(a.createdAt) : 0
      const right = b.createdAt ? Date.parse(b.createdAt) : 0
      return right - left
    })

  res.json({
    leads,
    count: leads.length,
    sourcePath: LEADS_PATH
  })
})

app.get('/api/system', async (_req, res) => {
  const [disk, activeSessions] = await Promise.all([
    loadDiskUsage(),
    loadActiveSessions()
  ])

  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const cpuCores = os.cpus().length || 1
  const loadAvg = os.loadavg()
  const cpuUsedPercent = Math.max(0, Math.min(100, Math.round((loadAvg[0] / cpuCores) * 100)))
  const uptimeSeconds = Math.round(os.uptime())

  res.json({
    cpu: {
      usedPercent: cpuUsedPercent,
      loadAvg: loadAvg.map((value) => Math.round(value * 100) / 100),
      cores: cpuCores
    },
    memory: {
      usedPercent: Math.round((usedMem / totalMem) * 100),
      usedGb: formatBytes(usedMem),
      totalGb: formatBytes(totalMem)
    },
    disk,
    uptime: {
      seconds: uptimeSeconds,
      text: formatUptime(uptimeSeconds)
    },
    activeSessions,
    draftsPending: countDraftFiles(),
    workspacePath: WORKSPACE_PATH,
    geoAuditPath: GEO_AUDIT_PATH,
    geoAuditDataPath: GEO_AUDIT_DATA_PATH,
    checkedAt: new Date().toISOString()
  })
})

app.get('/api/activity', (_req, res) => {
  const events = loadRecentActivity()
  res.json({
    events,
    count: events.length,
    sourcePath: OPENCLAW_LOGS_PATH
  })
})

app.get('*', (_req, res) => {
  if (!existsSync(join(distPath, 'index.html'))) {
    res.status(404).json({ error: 'Frontend build not found' })
    return
  }

  res.sendFile(join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Mission Control listening on http://localhost:${PORT}`)
})
