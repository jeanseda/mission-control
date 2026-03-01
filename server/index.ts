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
const api = express.Router()
const PORT = 3002

const WORKSPACE_PATH = '/Users/jeanseda/.openclaw/workspace'
const GEO_AUDIT_PATH = '/Users/jeanseda/.openclaw/workspace/geo-audit'
const GEO_AUDIT_DATA_PATH = '/Users/jeanseda/.openclaw/workspace/geo-audit/data'
const PAYMENTS_PATH = '/Users/jeanseda/.openclaw/workspace/geo-audit/data/payments.json'
const LEADS_PATH = '/Users/jeanseda/.openclaw/workspace/geo-audit/data/leads.json'
const AUDITS_PATH = '/Users/jeanseda/.openclaw/workspace/geo-audit/data/cache/ai-audits'
const DRAFTS_PATH = '/Users/jeanseda/.openclaw/workspace/drafts'
const OPENCLAW_LOGS_PATH = '/Users/jeanseda/.openclaw/logs'
const CRON_JOBS_PATH = '/Users/jeanseda/.openclaw/cron/jobs.json'
const BUSINESS_METRICS_PATH = join(__dirname, '../data/business-metrics.json')
const WORKSPACE_AGENTS_PATH = join(WORKSPACE_PATH, 'agents')
const SALES_AGENT_DB_PATH = join(WORKSPACE_PATH, 'agents/sales-agent/data/leads.db')
const ARCHIVED_SALES_AGENT_DB_PATH = join(WORKSPACE_PATH, 'archive/sales-agent/data/leads.db')
const SALES_AGENT_DATA_PATHS = [
  join(WORKSPACE_PATH, 'agents/sales-agent/data'),
  join(WORKSPACE_PATH, 'archive/sales-agent/data')
]

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

type AgentStatus = 'active' | 'scheduled' | 'idle'

type AgentSummary = {
  id: string
  name: string
  model: string
  status: AgentStatus
  cronJobs: number
  currentTask: string
  lastRunAt: string | null
  nextRunAt: string | null
  models: string[]
  workspaces: string[]
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

const loadBusinessMetrics = (): JsonObject => {
  return readJsonFile<JsonObject>(BUSINESS_METRICS_PATH, {})
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
    const payload = (job.payload ?? {}) as JsonObject
    return {
      id: String(job.id ?? ''),
      agentId: String(job.agentId ?? 'main'),
      name: String(job.name ?? job.id ?? 'Unnamed Job'),
      enabled: job.enabled !== false,
      model: typeof payload.model === 'string' ? payload.model : null,
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

const normalizeModelName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null

  const normalized = value.trim()
  if (!normalized) return null

  const modelId = normalized.split('/').pop() ?? normalized
  const lower = modelId.toLowerCase()

  if (lower.includes('gemini') && lower.includes('flash')) return 'gemini-flash'
  if (lower.includes('opus')) return 'opus'
  if (lower.includes('qwen')) return 'qwen'

  return modelId
}

const formatWorkspaceName = (value: string): string => {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const loadWorkspaceAgents = (): string[] => {
  if (!existsSync(WORKSPACE_AGENTS_PATH)) return []

  return readdirSync(WORKSPACE_AGENTS_PATH)
    .filter((entry) => {
      const entryPath = join(WORKSPACE_AGENTS_PATH, entry)
      try {
        return statSync(entryPath).isDirectory()
      } catch {
        return false
      }
    })
    .sort()
}

const isSyntheticPayment = (payment: Record<string, unknown>): boolean => {
  const businessName = String(payment.businessName ?? '').toLowerCase()
  const email = String(payment.email ?? '').toLowerCase()
  const sessionId = String(payment.sessionId ?? '').toLowerCase()

  return businessName.includes('acme co') || email.endsWith('.example') || sessionId.startsWith('cs_test_')
}

const loadRevenueEntries = () => {
  const metrics = loadBusinessMetrics()
  const history = Array.isArray(metrics.history) ? metrics.history : []

  const paymentEntries = loadPayments()
    .filter((payment) => !isSyntheticPayment(payment))
    .map((payment) => ({
      amount: Number(payment.amount ?? 0) || 0,
      timestamp: toIso(payment.timestamp),
      businessName: String(payment.businessName ?? payment.email ?? 'Unknown')
    }))

  const historyEntries = history
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry) => ({
      amount: Number(entry.amount ?? entry.value ?? entry.revenue ?? entry.total ?? 0) || 0,
      timestamp: toIso(entry.timestamp ?? entry.date ?? entry.createdAt),
      businessName: String(entry.businessName ?? entry.client ?? entry.name ?? 'Recorded revenue')
    }))

  return [...paymentEntries, ...historyEntries]
    .filter((entry) => entry.timestamp !== null && entry.amount > 0)
    .sort((a, b) => Date.parse(b.timestamp as string) - Date.parse(a.timestamp as string))
}

const loadRevenuePayload = () => {
  const metrics = loadBusinessMetrics()
  const goal = (metrics.goal ?? {}) as JsonObject
  const payments = loadRevenueEntries()
  const today = startOfToday().getTime()
  const week = startOfWeek().getTime()
  const month = startOfMonth().getTime()

  let todayTotal = 0
  let weekTotal = 0
  let monthTotal = 0

  for (const payment of payments) {
    const time = Date.parse(payment.timestamp as string)
    if (time >= today) todayTotal += payment.amount
    if (time >= week) weekTotal += payment.amount
    if (time >= month) monthTotal += payment.amount
  }

  return {
    today: todayTotal,
    week: weekTotal,
    month: payments.length > 0 ? monthTotal : Number(goal.total ?? 0) || 0,
    payments: payments.slice(0, 5),
    totalCount: payments.length,
    sourcePath: payments.length > 0 ? `${PAYMENTS_PATH}, ${BUSINESS_METRICS_PATH}` : BUSINESS_METRICS_PATH
  }
}

type BetterSqlite3Ctor = new (path: string, options?: Record<string, unknown>) => any

const loadBetterSqlite3Module = async (): Promise<BetterSqlite3Ctor | null> => {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>
    const imported = await dynamicImport('better-sqlite3')
    const resolved = imported?.default ?? imported
    return typeof resolved === 'function' ? (resolved as BetterSqlite3Ctor) : null
  } catch {
    return null
  }
}

const readSalesAgentLeadsWithBetterSqlite = async (dbPath: string): Promise<Array<Record<string, unknown>> | null> => {
  const Database = await loadBetterSqlite3Module()
  if (!Database) return null

  let db: any = null

  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true })
    const rows = db
      .prepare(`
        SELECT
          business_name,
          website,
          source,
          status,
          contact_email,
          created_at,
          updated_at,
          lead_score
        FROM leads
        ORDER BY datetime(COALESCE(updated_at, created_at)) DESC
      `)
      .all()

    return Array.isArray(rows)
      ? rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
      : []
  } catch {
    return null
  } finally {
    try {
      db?.close?.()
    } catch {
      // Ignore close failures for read-only checks.
    }
  }
}

const readSalesAgentLeadsWithSqliteCli = async (dbPath: string): Promise<Array<Record<string, unknown>>> => {
  const escapedPath = dbPath.replace(/"/g, '\\"')
  const query = [
    'SELECT',
    'business_name,',
    'website,',
    'source,',
    'status,',
    'contact_email,',
    'created_at,',
    'updated_at,',
    'lead_score',
    'FROM leads',
    'ORDER BY datetime(COALESCE(updated_at, created_at)) DESC'
  ].join(' ')
  const escapedQuery = query.replace(/"/g, '\\"')
  const result = await safeExec(`sqlite3 -json "${escapedPath}" "${escapedQuery}"`)

  if (!result.ok || !result.stdout.trim()) return []

  try {
    const parsed = JSON.parse(result.stdout) as Array<unknown>
    return parsed.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
  } catch {
    return []
  }
}

const loadSalesAgentDbLeads = async (): Promise<Array<Record<string, unknown>>> => {
  const dbPath = [SALES_AGENT_DB_PATH, ARCHIVED_SALES_AGENT_DB_PATH].find((path) => existsSync(path))
  if (!dbPath) return []

  const rows = await readSalesAgentLeadsWithBetterSqlite(dbPath)
  if (rows) return rows

  return readSalesAgentLeadsWithSqliteCli(dbPath)
}

const loadProspectBatchLeads = (): Array<{ record: Record<string, unknown>; filePath: string }> => {
  const leads: Array<{ record: Record<string, unknown>; filePath: string }> = []

  for (const dataPath of SALES_AGENT_DATA_PATHS) {
    if (!existsSync(dataPath)) continue

    const files = readdirSync(dataPath)
      .filter((fileName) => /^prospect-.*\.json$/i.test(fileName))
      .map((fileName) => join(dataPath, fileName))
      .sort((a, b) => {
        try {
          return statSync(b).mtimeMs - statSync(a).mtimeMs
        } catch {
          return 0
        }
      })

    for (const filePath of files) {
      const raw = readJsonFile<Array<unknown>>(filePath, [])
      for (const entry of raw) {
        if (entry && typeof entry === 'object') {
          leads.push({ record: entry as Record<string, unknown>, filePath })
        }
      }
    }
  }

  return leads
}

const loadLeadsPayload = async () => {
  const geoAuditLeads = loadLeads().map((lead) => ({
    name: String(lead.name ?? lead.fullName ?? lead.businessName ?? lead.email ?? 'Lead'),
    email: String(lead.email ?? ''),
    source: 'geo-audit',
    createdAt: toIso(lead.createdAt ?? lead.timestamp) ?? null,
    website: String(lead.website ?? lead.websiteUrl ?? '')
  }))

  const salesDbLeads = (await loadSalesAgentDbLeads()).map((lead) => ({
    name: String(lead.business_name ?? lead.contact_name ?? lead.contact_email ?? 'Lead'),
    email: String(lead.contact_email ?? ''),
    source: 'sales-db',
    createdAt: toIso(lead.updated_at ?? lead.created_at) ?? null,
    website: String(lead.website ?? '')
  }))

  const prospectBatchLeads = loadProspectBatchLeads().map(({ record, filePath }) => ({
    name: String(record.business_name ?? record.name ?? record.website ?? 'Lead'),
    email: '',
    source: 'sales-prospect',
    createdAt: (() => {
      try {
        return statSync(filePath).mtime.toISOString()
      } catch {
        return null
      }
    })(),
    website: String(record.website ?? '')
  }))

  const deduped = new Map<string, { name: string; email: string; source: string; createdAt: string | null }>()

  for (const lead of [...salesDbLeads, ...geoAuditLeads, ...prospectBatchLeads]) {
    const key = `${lead.email.toLowerCase()}|${lead.website.toLowerCase()}|${lead.name.toLowerCase()}`
    if (!deduped.has(key)) {
      deduped.set(key, {
        name: lead.name,
        email: lead.email,
        source: lead.source,
        createdAt: lead.createdAt
      })
    }
  }

  const leads = Array.from(deduped.values()).sort((a, b) => {
    const left = a.createdAt ? Date.parse(a.createdAt) : 0
    const right = b.createdAt ? Date.parse(b.createdAt) : 0
    return right - left
  })

  return {
    leads,
    count: leads.length,
    sourcePath: [LEADS_PATH, SALES_AGENT_DB_PATH, ARCHIVED_SALES_AGENT_DB_PATH].join(', ')
  }
}

const buildAgentSummary = ({
  id,
  name,
  jobs,
  workspaces
}: {
  id: string
  name: string
  jobs: Array<Record<string, unknown>>
  workspaces: string[]
}): AgentSummary => {
  const runningJob = jobs.find((job) => job.status === 'running') ?? null
  const latestJob = [...jobs]
    .sort((a, b) => Date.parse(String(b.lastRunAt ?? '')) - Date.parse(String(a.lastRunAt ?? '')))
    .find(Boolean) ?? null
  const models = Array.from(
    new Set(
      jobs
        .map((job) => normalizeModelName(job.model))
        .filter((model): model is string => Boolean(model))
    )
  )

  return {
    id,
    name,
    model: models[0] ?? 'unknown',
    status: runningJob ? 'active' : jobs.length > 0 ? 'scheduled' : 'idle',
    cronJobs: jobs.length,
    currentTask: String(runningJob?.name ?? latestJob?.name ?? 'Awaiting scheduled work'),
    lastRunAt: (latestJob?.lastRunAt as string | null | undefined) ?? null,
    nextRunAt: (runningJob?.nextRunAt as string | null | undefined) ?? (latestJob?.nextRunAt as string | null | undefined) ?? null,
    models,
    workspaces
  }
}

const loadAgents = async () => {
  const cronPayload = await loadCronJobs()
  const workspaceAgents = loadWorkspaceAgents()
  const jobs = cronPayload.jobs.map((job) => ({
    ...job,
    name: String(job.name ?? ''),
    status: String(job.status ?? ''),
    model: typeof job.model === 'string' ? job.model : null
  }))
  const sprintJobs = jobs.filter((job) => job.name.toLowerCase().includes('sprint worker'))
  const salesJobs = jobs.filter((job) => {
    const name = job.name.toLowerCase()
    return name.includes('sales') || name.includes('prospect')
  })
  const maxJobs = jobs.filter((job) => !sprintJobs.includes(job) && !salesJobs.includes(job))

  const agents: AgentSummary[] = []

  if (maxJobs.length > 0) {
    agents.push(
      buildAgentSummary({
        id: 'max',
        name: 'Max (COO)',
        jobs: maxJobs,
        workspaces: workspaceAgents.length > 0 ? workspaceAgents.map(formatWorkspaceName) : ['Workspace']
      })
    )
  }

  if (sprintJobs.length > 0) {
    agents.push(
      buildAgentSummary({
        id: 'sprint-worker',
        name: 'Sprint Worker',
        jobs: sprintJobs,
        workspaces: ['Workspace']
      })
    )
  }

  if (salesJobs.length > 0 || SALES_AGENT_DATA_PATHS.some((path) => existsSync(path))) {
    agents.push(
      buildAgentSummary({
        id: 'sales-agent',
        name: 'Sales Agent',
        jobs: salesJobs,
        workspaces: ['Sales Agent']
      })
    )
  }

  return {
    agents,
    count: agents.length,
    workspaceAgents,
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
  const result = await safeExec('openclaw sessions --json')
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

api.get('/status', async (_req, res) => {
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

api.get('/crons', async (_req, res) => {
  const payload = await loadCronJobs()
  res.json({
    ...payload,
    checkedAt: new Date().toISOString()
  })
})

api.get('/cron-status', async (_req, res) => {
  const payload = await loadCronJobs()
  res.json({
    ...payload,
    checkedAt: new Date().toISOString()
  })
})

api.get('/agents', async (_req, res) => {
  const payload = await loadAgents()
  res.json(payload)
})

api.get('/revenue', (_req, res) => {
  res.json(loadRevenuePayload())
})

api.get('/audits', (_req, res) => {
  const audits = loadAuditSummaries()
  const today = startOfToday().getTime()

  res.json({
    total: audits.length,
    today: audits.filter((audit) => Date.parse(audit.timestamp) >= today).length,
    recent: audits.slice(0, 5),
    sourcePath: AUDITS_PATH
  })
})

api.get('/leads', async (_req, res) => {
  res.json(await loadLeadsPayload())
})

api.get('/system', async (_req, res) => {
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

api.get('/activity', (_req, res) => {
  const events = loadRecentActivity()
  res.json({
    events,
    count: events.length,
    sourcePath: OPENCLAW_LOGS_PATH
  })
})

app.use('/api', api)

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
