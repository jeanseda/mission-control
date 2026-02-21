import { useState, useEffect } from 'react'

interface ClaudeUsageData {
  plan: string
  lastChecked: string
  limits: {
    session: {
      used: number
      resetsIn: string
    }
    weeklyAllModels: {
      used: number
      remaining: number
      resets: string
    }
    sonnetOnly: {
      used: number
      remaining: number
      resets: string
    }
  }
  history: Array<{
    date: string
    time: string
    weeklyAllModels: number
    sonnetOnly: number
  }>
  notes?: string
}

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
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUsage()
    const interval = setInterval(loadUsage, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  const loadUsage = async () => {
    try {
      // Load API usage stats
      const res = await fetch('/api/usage')
      const data = await res.json()
      setUsage(data)

      // Load Claude-specific usage from data file
      try {
        const claudeRes = await fetch('/data/claude-usage.json')
        if (claudeRes.ok) {
          const claudeData = await claudeRes.json()
          setClaudeUsage(claudeData)
        }
      } catch (e) {
        console.log('Claude usage file not available:', e)
      }
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

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="card">
        <div className="shimmer h-40 rounded-lg" />
        <p className="text-zinc-500 text-center mt-4">Loading usage data...</p>
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

  const weeklyUsagePercent = claudeUsage?.limits.weeklyAllModels.used || 0
  const sonnetUsagePercent = claudeUsage?.limits.sonnetOnly.used || 0

  return (
    <div className="space-y-6">
      {/* Claude Max Plan - Hero Card */}
      <div className="card accent-border">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-3xl shadow-lg">
              🧠
            </div>
            <div>
              <p className="text-sm text-orange-400 uppercase tracking-wider font-bold">Your Plan</p>
              <p className="text-3xl font-black mt-1 gradient-text">Claude Max</p>
              <p className="text-zinc-500 text-sm mt-1">$200/month • Unlimited usage*</p>
            </div>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-6xl opacity-50">♾️</p>
            <p className="text-xs text-zinc-500 mt-2">Rate limits apply</p>
          </div>
        </div>

        {claudeUsage && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* All Models Usage */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/20">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wider">All Models</p>
                  <p className="text-3xl font-black mt-1">{weeklyUsagePercent}%</p>
                </div>
                <p className="text-sm text-zinc-500">{claudeUsage.limits.weeklyAllModels.remaining}% left</p>
              </div>
              <div className="progress-bar h-3 mb-2">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${weeklyUsagePercent}%`,
                    background: weeklyUsagePercent > 80 
                      ? 'linear-gradient(90deg, var(--warning), var(--danger))' 
                      : 'linear-gradient(90deg, var(--accent), var(--accent-secondary))'
                  }} 
                />
              </div>
              <p className="text-xs text-zinc-500">Resets {claudeUsage.limits.weeklyAllModels.resets}</p>
            </div>

            {/* Sonnet Usage */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-transparent border border-green-500/20">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wider">Sonnet Only</p>
                  <p className="text-3xl font-black mt-1">{sonnetUsagePercent}%</p>
                </div>
                <p className="text-sm text-zinc-500">{claudeUsage.limits.sonnetOnly.remaining}% left</p>
              </div>
              <div className="progress-bar h-3 mb-2">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${sonnetUsagePercent}%`,
                    background: 'linear-gradient(90deg, var(--success), var(--info))'
                  }} 
                />
              </div>
              <p className="text-xs text-zinc-500">Resets {claudeUsage.limits.sonnetOnly.resets}</p>
            </div>
          </div>
        )}

        {claudeUsage?.notes && (
          <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm text-blue-300">💡 {claudeUsage.notes}</p>
          </div>
        )}

        {claudeUsage && (
          <p className="text-xs text-zinc-600 mt-4">
            Last updated: {formatTime(claudeUsage.lastChecked)}
          </p>
        )}
      </div>

      {/* Activity Stats Grid */}
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
            <span>Input</span>
          </div>
          <div className="stat-value">{formatNumber(usage.totals.tokensIn)}</div>
          <p className="text-xs text-zinc-500 mt-1">tokens in</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
            <span>📤</span>
            <span>Output</span>
          </div>
          <div className="stat-value">{formatNumber(usage.totals.tokensOut)}</div>
          <p className="text-xs text-zinc-500 mt-1">tokens out</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
            <span>⚡</span>
            <span>Automations</span>
          </div>
          <div className="stat-value">{usage.totals.cronRuns}</div>
          <p className="text-xs text-zinc-500 mt-1">cron runs</p>
        </div>
      </div>

      {/* Models in Use */}
      <div className="card">
        <div className="card-header">
          <span>🧠</span> Active Models
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-lg">
                💎
              </div>
              <div>
                <p className="font-bold text-sm">Conversations</p>
                <p className="text-xs text-zinc-500">Direct chat with you</p>
              </div>
            </div>
            <span className="badge badge-info text-xs">Opus 4.5</span>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-transparent border border-green-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center text-lg">
                ⚡
              </div>
              <div>
                <p className="font-bold text-sm">Automations</p>
                <p className="text-xs text-zinc-500">Background work</p>
              </div>
            </div>
            <span className="badge badge-success text-xs">Sonnet 4.5</span>
          </div>
        </div>
        <div className="mt-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
          <p className="text-xs text-zinc-400">
            💡 <strong className="text-zinc-300">Smart routing:</strong> Using Sonnet for background tasks keeps costs ~5x lower while maintaining high quality.
          </p>
        </div>
      </div>

      {/* Cron Job Health */}
      <div className="card">
        <div className="card-header">
          <span>⏰</span> Automation Health
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-5 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
            <p className="text-3xl font-black">{usage.cronStats.total}</p>
            <p className="text-xs text-zinc-500 mt-2">Total Jobs</p>
          </div>
          <div className="text-center p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <p className="text-3xl font-black text-emerald-400">{usage.cronStats.successful}</p>
            <p className="text-xs text-zinc-500 mt-2">Successful</p>
          </div>
          <div className="text-center p-5 rounded-xl bg-red-500/10 border border-red-500/30">
            <p className="text-3xl font-black text-red-400">{usage.cronStats.failed}</p>
            <p className="text-xs text-zinc-500 mt-2">Failed</p>
          </div>
        </div>
        {usage.cronStats.failed > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-sm text-amber-400">
              ⚠️ <strong>{usage.cronStats.failed}</strong> job{usage.cronStats.failed !== 1 ? 's have' : ' has'} errors — check the Agents tab for details
            </p>
          </div>
        )}
        <div className="mt-4 flex justify-between items-center text-xs text-zinc-500">
          <span>Success rate:</span>
          <span className="font-bold text-emerald-400">
            {usage.cronStats.total > 0 
              ? Math.round((usage.cronStats.successful / usage.cronStats.total) * 100)
              : 0}%
          </span>
        </div>
      </div>

      {/* 7-Day Activity Chart */}
      {last7Days.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span>📊</span> Last 7 Days Activity
          </div>
          <div className="space-y-4">
            {last7Days.map(day => {
              const maxTokens = Math.max(...last7Days.map(d => d.tokensIn + d.tokensOut), 1)
              const dayTotal = day.tokensIn + day.tokensOut
              const percentage = (dayTotal / maxTokens) * 100
              
              return (
                <div key={day.date}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-zinc-300">
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-zinc-400">{day.sessions} sessions</span>
                      <span className="text-zinc-400">{day.cronRuns} cron</span>
                      <span className="text-zinc-300 font-bold">{formatNumber(dayTotal)} tokens</span>
                    </div>
                  </div>
                  <div className="h-3 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700/50">
                    <div 
                      className="h-full bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 rounded-full transition-all duration-500 relative"
                      style={{ width: `${percentage}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Usage History */}
      {claudeUsage?.history && claudeUsage.history.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span>📈</span> Usage History
          </div>
          <div className="space-y-2">
            {claudeUsage.history.slice(-10).reverse().map((entry, i) => (
              <div key={i} className="item-row">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500" />
                  <div>
                    <p className="text-sm font-medium">{entry.date} at {entry.time}</p>
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-zinc-400">All: <strong className="text-orange-400">{entry.weeklyAllModels}%</strong></span>
                  <span className="text-zinc-400">Sonnet: <strong className="text-green-400">{entry.sonnetOnly}%</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan Benefits */}
      <div className="card">
        <div className="card-header">
          <span>✨</span> Claude Max Benefits
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {[
            { icon: '♾️', text: 'Unlimited messages*', desc: 'Within rate limits' },
            { icon: '🚀', text: 'Priority access', desc: 'During high demand' },
            { icon: '🧠', text: 'All models', desc: 'Opus, Sonnet, Haiku' },
            { icon: '⚡', text: 'Advanced features', desc: 'Extended thinking, vision' },
          ].map((benefit, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30">
              <span className="text-2xl">{benefit.icon}</span>
              <div>
                <p className="font-semibold text-sm">{benefit.text}</p>
                <p className="text-xs text-zinc-500">{benefit.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
          <p className="text-sm text-zinc-300">
            💡 <strong>Your $200/month covers all usage.</strong> Token counts shown are for visibility, not billing.
            Rate limits reset periodically — if you hit them, just wait a bit.
          </p>
        </div>
      </div>
    </div>
  )
}
