import { useState, useEffect } from 'react'

// Types
interface BusinessMetrics {
  goal: {
    monthly_target: number
    current_month: string
    mrr: number
    one_time: number
    total: number
    progress_percent: number
  }
  clients: Client[]
  pipeline: Deal[]
  history: RevenueEvent[]
  alerts: Alert[]
  last_updated: string
}

interface Client {
  id: string
  name: string
  status: 'active' | 'onboarding' | 'churned' | 'paused'
  type: 'recurring' | 'one_time'
  mrr: number
  start_date: string
  last_contact: string
  health_score: number
  notes?: string
  owner?: string
  location?: string
  business?: string
}

interface Deal {
  id: string
  name: string
  value: number
  stage: 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost'
  probability: number
  expected_close: string
  created_at: string
  notes?: string
}

interface RevenueEvent {
  id: string
  date: string
  type: 'recurring' | 'one_time'
  amount: number
  client_id?: string
  client_name: string
  description: string
}

interface Alert {
  id: string
  type: 'revenue' | 'client_health' | 'pipeline' | 'leads'
  severity: 'warning' | 'critical' | 'info'
  message: string
  created_at: string
  resolved?: boolean
}

export function Business() {
  const [metrics, setMetrics] = useState<BusinessMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddClient, setShowAddClient] = useState(false)
  const [showAddDeal, setShowAddDeal] = useState(false)
  const [showLogRevenue, setShowLogRevenue] = useState(false)

  useEffect(() => {
    loadMetrics()
    const interval = setInterval(loadMetrics, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  const loadMetrics = async () => {
    try {
      const res = await fetch('/api/business')
      const data = await res.json()
      setMetrics(data)
    } catch (e) {
      console.error('Failed to load business metrics:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading business metrics...</p>
      </div>
    )
  }

  const activeClients = metrics.clients.filter(c => c.status === 'active' || c.status === 'onboarding')
  const pipelineValue = metrics.pipeline.reduce((sum, d) => sum + (d.value * (d.probability / 100)), 0)
  const unresolvedAlerts = metrics.alerts.filter(a => !a.resolved)

  return (
    <div className="space-y-6">
      {/* Alerts Banner */}
      {unresolvedAlerts.length > 0 && (
        <div className="space-y-2">
          {unresolvedAlerts.map(alert => (
            <div 
              key={alert.id}
              className={`p-4 rounded-lg border ${
                alert.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                alert.severity === 'warning' ? 'bg-yellow-500/10 border-yellow-500/30' :
                'bg-blue-500/10 border-blue-500/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">
                  {alert.severity === 'critical' ? '🚨' : 
                   alert.severity === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{alert.message}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {new Date(alert.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Revenue Goal Progress */}
      <div className="card">
        <div className="card-header">
          <span>💰</span> Monthly Revenue Goal
        </div>
        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-zinc-400">Current Month Progress</p>
              <p className="text-4xl font-bold gradient-text">
                ${metrics.goal.total.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-400">Goal</p>
              <p className="text-2xl font-bold text-zinc-500">
                ${metrics.goal.monthly_target.toLocaleString()}
              </p>
            </div>
          </div>
          
          <div className="progress-bar h-4">
            <div 
              className="progress-fill"
              style={{ width: `${Math.min(metrics.goal.progress_percent, 100)}%` }}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-700">
            <div>
              <p className="text-sm text-zinc-400">MRR</p>
              <p className="text-xl font-bold text-emerald-400">
                ${metrics.goal.mrr.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">One-time</p>
              <p className="text-xl font-bold text-blue-400">
                ${metrics.goal.one_time.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          icon="👥" 
          label="Active Clients" 
          value={activeClients.length} 
          subtext={`${metrics.clients.length} total`}
        />
        <StatCard 
          icon="💵" 
          label="MRR" 
          value={`$${metrics.goal.mrr}`} 
          subtext="monthly recurring"
        />
        <StatCard 
          icon="📊" 
          label="Pipeline" 
          value={`$${Math.round(pipelineValue)}`} 
          subtext={`${metrics.pipeline.length} deals`}
        />
        <StatCard 
          icon="🎯" 
          label="Progress" 
          value={`${Math.round(metrics.goal.progress_percent)}%`} 
          subtext="to goal"
        />
      </div>

      {/* Clients */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>👥</span> Clients
          </div>
          <button 
            onClick={() => setShowAddClient(true)}
            className="btn-primary text-sm"
          >
            + Add Client
          </button>
        </div>
        
        {metrics.clients.length === 0 ? (
          <p className="text-zinc-500 text-sm">No clients yet</p>
        ) : (
          <div className="space-y-4">
            {metrics.clients.map(client => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        )}
      </div>

      {/* Pipeline */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🔄</span> Sales Pipeline
          </div>
          <button 
            onClick={() => setShowAddDeal(true)}
            className="btn-primary text-sm"
          >
            + Add Deal
          </button>
        </div>
        
        {metrics.pipeline.length === 0 ? (
          <p className="text-zinc-500 text-sm">No deals in pipeline</p>
        ) : (
          <div className="space-y-3">
            {metrics.pipeline.map(deal => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        )}
      </div>

      {/* Revenue History */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>📈</span> Revenue History
          </div>
          <button 
            onClick={() => setShowLogRevenue(true)}
            className="btn-primary text-sm"
          >
            + Log Revenue
          </button>
        </div>
        
        {metrics.history.length === 0 ? (
          <p className="text-zinc-500 text-sm">No revenue logged yet</p>
        ) : (
          <div className="space-y-2">
            {metrics.history.slice(0, 10).map(event => (
              <div key={event.id} className="item-row">
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {event.type === 'recurring' ? '🔄' : '💵'}
                  </span>
                  <div>
                    <p className="font-medium">{event.client_name}</p>
                    <p className="text-xs text-zinc-500">{event.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-400">${event.amount}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(event.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddClient && (
        <AddClientModal 
          onClose={() => setShowAddClient(false)} 
          onAdd={loadMetrics}
        />
      )}
      {showAddDeal && (
        <AddDealModal 
          onClose={() => setShowAddDeal(false)} 
          onAdd={loadMetrics}
        />
      )}
      {showLogRevenue && (
        <LogRevenueModal 
          clients={metrics.clients}
          onClose={() => setShowLogRevenue(false)} 
          onLog={loadMetrics}
        />
      )}
    </div>
  )
}

// Client Card Component
function ClientCard({ client }: { client: Client }) {
  const daysSinceContact = Math.floor(
    (Date.now() - new Date(client.last_contact).getTime()) / (1000 * 60 * 60 * 24)
  )
  
  const healthColor = 
    client.health_score >= 80 ? 'text-emerald-400' :
    client.health_score >= 50 ? 'text-yellow-400' :
    'text-red-400'

  return (
    <div className="item-row">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <p className="font-medium text-lg">{client.name}</p>
          <span className={`badge ${
            client.status === 'active' ? 'badge-success' :
            client.status === 'onboarding' ? 'badge-warning' :
            client.status === 'paused' ? 'badge-neutral' :
            'badge-danger'
          }`}>
            {client.status}
          </span>
          <span className="badge badge-neutral">{client.type}</span>
        </div>
        
        {(client.business || client.location) && (
          <p className="text-sm text-zinc-500 mb-2">
            {client.business} {client.location && `• ${client.location}`}
          </p>
        )}
        
        {client.notes && (
          <p className="text-sm text-zinc-400 mb-2">{client.notes}</p>
        )}
        
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>Started: {new Date(client.start_date).toLocaleDateString()}</span>
          <span>Last contact: {daysSinceContact}d ago</span>
          <span className={healthColor}>Health: {client.health_score}%</span>
        </div>
      </div>
      
      <div className="text-right">
        <p className="text-2xl font-bold text-emerald-400">
          ${client.mrr}
        </p>
        <p className="text-sm text-zinc-500">/month</p>
      </div>
    </div>
  )
}

// Deal Card Component
function DealCard({ deal }: { deal: Deal }) {
  const daysInPipeline = Math.floor(
    (Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24)
  )
  
  const stageColor = {
    lead: 'badge-neutral',
    qualified: 'badge-info',
    proposal: 'badge-warning',
    negotiation: 'badge-warning',
    closed_won: 'badge-success',
    closed_lost: 'badge-danger'
  }

  return (
    <div className="item-row">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <p className="font-medium">{deal.name}</p>
          <span className={`badge ${stageColor[deal.stage]}`}>
            {deal.stage.replace('_', ' ')}
          </span>
        </div>
        
        {deal.notes && (
          <p className="text-sm text-zinc-500 mb-2">{deal.notes}</p>
        )}
        
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>{deal.probability}% probability</span>
          <span>Expected: {new Date(deal.expected_close).toLocaleDateString()}</span>
          <span>{daysInPipeline}d in pipeline</span>
        </div>
      </div>
      
      <div className="text-right">
        <p className="text-xl font-bold text-blue-400">
          ${deal.value}
        </p>
        <p className="text-xs text-zinc-500">
          ~${Math.round(deal.value * (deal.probability / 100))} weighted
        </p>
      </div>
    </div>
  )
}

// Add Client Modal
function AddClientModal({ onClose, onAdd }: { onClose: () => void, onAdd: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    status: 'onboarding' as Client['status'],
    type: 'recurring' as Client['type'],
    mrr: 0,
    start_date: new Date().toISOString().split('T')[0],
    owner: '',
    location: '',
    business: '',
    notes: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await fetch('/api/business/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      onAdd()
      onClose()
    } catch (e) {
      console.error('Failed to add client:', e)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Add Client</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Client Name *</label>
            <input
              type="text"
              required
              className="input"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Status</label>
              <select
                className="input"
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as Client['status'] })}
              >
                <option value="onboarding">Onboarding</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="churned">Churned</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Type</label>
              <select
                className="input"
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as Client['type'] })}
              >
                <option value="recurring">Recurring</option>
                <option value="one_time">One-time</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">MRR ($)</label>
            <input
              type="number"
              className="input"
              value={formData.mrr}
              onChange={e => setFormData({ ...formData, mrr: parseInt(e.target.value) || 0 })}
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Business</label>
            <input
              type="text"
              className="input"
              value={formData.business}
              onChange={e => setFormData({ ...formData, business: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Location</label>
              <input
                type="text"
                className="input"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
              />
            </div>
            
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Owner</label>
              <input
                type="text"
                className="input"
                value={formData.owner}
                onChange={e => setFormData({ ...formData, owner: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Notes</label>
            <textarea
              className="input"
              rows={3}
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn-primary flex-1">Add Client</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Add Deal Modal
function AddDealModal({ onClose, onAdd }: { onClose: () => void, onAdd: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    value: 0,
    stage: 'lead' as Deal['stage'],
    probability: 25,
    expected_close: '',
    notes: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await fetch('/api/business/deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      onAdd()
      onClose()
    } catch (e) {
      console.error('Failed to add deal:', e)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Add Deal</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Deal Name *</label>
            <input
              type="text"
              required
              className="input"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Value ($) *</label>
              <input
                type="number"
                required
                className="input"
                value={formData.value}
                onChange={e => setFormData({ ...formData, value: parseInt(e.target.value) || 0 })}
              />
            </div>
            
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Probability (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                className="input"
                value={formData.probability}
                onChange={e => setFormData({ ...formData, probability: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Stage</label>
            <select
              className="input"
              value={formData.stage}
              onChange={e => setFormData({ ...formData, stage: e.target.value as Deal['stage'] })}
            >
              <option value="lead">Lead</option>
              <option value="qualified">Qualified</option>
              <option value="proposal">Proposal</option>
              <option value="negotiation">Negotiation</option>
              <option value="closed_won">Closed Won</option>
              <option value="closed_lost">Closed Lost</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Expected Close Date</label>
            <input
              type="date"
              className="input"
              value={formData.expected_close}
              onChange={e => setFormData({ ...formData, expected_close: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Notes</label>
            <textarea
              className="input"
              rows={3}
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn-primary flex-1">Add Deal</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Log Revenue Modal
function LogRevenueModal({ clients, onClose, onLog }: { 
  clients: Client[]
  onClose: () => void
  onLog: () => void 
}) {
  const [formData, setFormData] = useState({
    client_id: '',
    amount: 0,
    type: 'one_time' as 'recurring' | 'one_time',
    description: '',
    date: new Date().toISOString().split('T')[0]
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await fetch('/api/business/revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      onLog()
      onClose()
    } catch (e) {
      console.error('Failed to log revenue:', e)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Log Revenue</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Client</label>
            <select
              className="input"
              value={formData.client_id}
              onChange={e => setFormData({ ...formData, client_id: e.target.value })}
            >
              <option value="">-- Select Client --</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Amount ($) *</label>
              <input
                type="number"
                required
                className="input"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: parseInt(e.target.value) || 0 })}
              />
            </div>
            
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Type</label>
              <select
                className="input"
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as 'recurring' | 'one_time' })}
              >
                <option value="one_time">One-time</option>
                <option value="recurring">Recurring</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Date</label>
            <input
              type="date"
              className="input"
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Description *</label>
            <input
              type="text"
              required
              className="input"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn-primary flex-1">Log Revenue</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Stat Card
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
