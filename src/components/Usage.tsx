import { useState, useEffect } from 'react'

interface UsageData {
  daily: Array<{
    date: string
    tokensIn: number
    tokensOut: number
    sessions: number
    cronRuns: number
  }>
  totals: {
    tokensIn: number
    tokensOut: number
    sessions: number
    cronRuns: number
  }
  cronStats: {
    total: number
    successful: number
    failed: number
  }
  estimatedCost: number
  models: {
    conversations: string
    cronJobs: string
  }
  lastUpdated: string
}

export function UsagePanel() {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUsage()
    const interval = setInterval(loadUsage, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  const loadUsage = async () => {
    try {
      const res = await fetch('/api/usage')
      const data = await res.json()
      setUsage(data)
    } catch (e) {
      console.error('Failed to load usage:', e)
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toString()
  }

  const formatCost = (cost: number) => {
    if (cost < 0.01) return '<$0.01'
    return `$${cost.toFixed(2)}`
  }

  if (loading) {
    return (
      <div className="card">
        <p className="text-zinc-500">Loading usage data...</p>
      </div>
    )
  }

  if (!usage) {
    return (
      <div className="card">
        <p className="text-zinc-500">Unable to load usage data</p>
      </div>
    )
  }

  // Get last 7 days for chart
  const last7Days = usage.daily.slice(-7)

  return (
    <div className="space-y-6">
      {/* Plan Info */}
      <div className="card accent-border mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-orange-400 uppercase tracking-wider font-medium">Your Plan</p>
            <p className="text-2xl font-bold mt-1">Claude Max</p>
            <p className="text-zinc-500 text-sm mt-1">$200/month • Flat rate, not per-token</p>
          </div>
          <div className="text-right">
            <p className="text-4xl">♾️</p>
            <p className="text-xs text-zinc-500">Rate limits apply</p>
          </div>
        </div>
      </div>

      {/* Activity Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
            <span>💬</span>
            <span>Sessions</span>
          </div>
          <div className="stat-value">{usage.totals.sessions}</div>
          <p className="text-xs text-zinc-500 mt-1">conversations</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
            <span>📥</span>
            <span>Tokens In</span>
          </div>
          <div className="stat-value">{formatNumber(usage.totals.tokensIn)}</div>
          <p className="text-xs text-zinc-500 mt-1">input tokens</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
            <span>📤</span>
            <span>Tokens Out</span>
          </div>
          <div className="stat-value">{formatNumber(usage.totals.tokensOut)}</div>
          <p className="text-xs text-zinc-500 mt-1">output tokens</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
            <span>⚡</span>
            <span>Cron Runs</span>
          </div>
          <div className="stat-value">{usage.totals.cronRuns}</div>
          <p className="text-xs text-zinc-500 mt-1">automated tasks</p>
        </div>
      </div>

      {/* Models in Use */}
      <div className="card">
        <div className="card-header">
          <span>🧠</span> Models in Use
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="item-row">
            <div>
              <p className="font-medium text-sm">Conversations</p>
              <p className="text-xs text-zinc-500">Direct chat with you</p>
            </div>
            <span className="badge badge-info">Opus</span>
          </div>
          <div className="item-row">
            <div>
              <p className="font-medium text-sm">Cron Jobs</p>
              <p className="text-xs text-zinc-500">Automated work</p>
            </div>
            <span className="badge badge-success">Sonnet</span>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-4">
          💡 Using Sonnet for background work keeps costs ~5x lower than Opus
        </p>
      </div>

      {/* Cron Job Health */}
      <div className="card">
        <div className="card-header">
          <span>⏰</span> Cron Job Health
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 rounded-lg bg-zinc-800/50">
            <p className="text-2xl font-bold">{usage.cronStats.total}</p>
            <p className="text-xs text-zinc-500">Total Jobs</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-emerald-500/10">
            <p className="text-2xl font-bold text-emerald-400">{usage.cronStats.successful}</p>
            <p className="text-xs text-zinc-500">Successful</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-red-500/10">
            <p className="text-2xl font-bold text-red-400">{usage.cronStats.failed}</p>
            <p className="text-xs text-zinc-500">Failed</p>
          </div>
        </div>
        {usage.cronStats.failed > 0 && (
          <p className="text-xs text-amber-400 mt-4">
            ⚠️ Some jobs have errors — check the Agents tab for details
          </p>
        )}
      </div>

      {/* Daily Usage Chart */}
      {last7Days.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span>📊</span> Last 7 Days
          </div>
          <div className="space-y-3">
            {last7Days.map(day => {
              const maxTokens = Math.max(...last7Days.map(d => d.tokensIn + d.tokensOut), 1)
              const dayTotal = day.tokensIn + day.tokensOut
              const percentage = (dayTotal / maxTokens) * 100
              
              return (
                <div key={day.date}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-zinc-400">
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-zinc-300">{formatNumber(dayTotal)} tokens</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-zinc-500 mt-1">
                    <span>{day.cronRuns} cron runs</span>
                    <span>{day.sessions} sessions</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Plan Details */}
      <div className="card">
        <div className="card-header">
          <span>💡</span> Claude Max Benefits
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400">✓</span>
            <span>Unlimited messages (within rate limits)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-emerald-400">✓</span>
            <span>Priority access during high demand</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-emerald-400">✓</span>
            <span>Access to all Claude models</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-emerald-400">✓</span>
            <span>Extended thinking & advanced features</span>
          </div>
        </div>
        <hr className="border-zinc-700 my-4" />
        <p className="text-xs text-zinc-500">
          💡 Your $200/month covers all usage. Token counts shown are for visibility, not billing.
          Rate limits reset periodically — if you hit them, just wait a bit.
        </p>
      </div>
    </div>
  )
}
