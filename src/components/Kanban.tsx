import { useState } from 'react'

export interface KanbanSubtask {
  id: string
  title: string
  completed: boolean
}

export interface KanbanTask {
  id: string
  title: string
  description?: string
  status: 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  assignee?: string
  dueDate?: string
  tags?: string[]
  subtasks?: KanbanSubtask[]
  project?: string
  createdDate?: string
  completedDate?: string
}

interface Props {
  tasks: KanbanTask[]
  onTaskMove?: (taskId: string, newStatus: KanbanTask['status']) => void
  onTaskClick?: (task: KanbanTask) => void
}

const columns: Array<{ id: KanbanTask['status']; title: string; icon: string; color: string }> = [
  { id: 'backlog', title: 'Backlog', icon: '📋', color: 'text-zinc-400' },
  { id: 'todo', title: 'To Do', icon: '📝', color: 'text-blue-400' },
  { id: 'in_progress', title: 'In Progress', icon: '🔄', color: 'text-amber-400' },
  { id: 'blocked', title: 'Blocked', icon: '🚫', color: 'text-red-400' },
  { id: 'done', title: 'Done', icon: '✅', color: 'text-emerald-400' },
]

const priorityConfig = {
  low: { bg: 'bg-zinc-500/15', text: 'text-zinc-400', border: 'priority-low' },
  medium: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'priority-medium' },
  high: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'priority-high' },
  critical: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'priority-critical' },
}

const priorityLabels = {
  low: 'Low',
  medium: 'Medium', 
  high: 'High',
  critical: '🔥 Critical',
}

export function KanbanBoard({ tasks, onTaskMove, onTaskClick }: Props) {
  const [draggedTask, setDraggedTask] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<KanbanTask['status'] | null>(null)

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, columnId: KanbanTask['status']) => {
    e.preventDefault()
    setDragOverColumn(columnId)
  }

  const handleDragLeave = () => {
    setDragOverColumn(null)
  }

  const handleDrop = (status: KanbanTask['status']) => {
    if (draggedTask && onTaskMove) {
      onTaskMove(draggedTask, status)
    }
    setDraggedTask(null)
    setDragOverColumn(null)
  }

  const getSubtaskProgress = (subtasks?: KanbanSubtask[]) => {
    if (!subtasks || subtasks.length === 0) return null
    const completed = subtasks.filter(s => s.completed).length
    return { completed, total: subtasks.length, percent: Math.round((completed / subtasks.length) * 100) }
  }

  const formatDueDate = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000)
    
    if (diffDays < 0) return { text: 'Overdue', class: 'text-red-400 bg-red-500/15' }
    if (diffDays === 0) return { text: 'Today', class: 'text-amber-400 bg-amber-500/15' }
    if (diffDays === 1) return { text: 'Tomorrow', class: 'text-blue-400 bg-blue-500/15' }
    if (diffDays <= 7) return { text: d.toLocaleDateString('en-US', { weekday: 'short' }), class: 'text-zinc-400 bg-zinc-500/15' }
    return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), class: 'text-zinc-400 bg-zinc-500/15' }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {columns.map(column => {
        const columnTasks = tasks.filter(t => t.status === column.id)
        const isOver = dragOverColumn === column.id
        
        return (
          <div 
            key={column.id}
            className={`kanban-column transition-all duration-200 ${isOver ? 'ring-2 ring-orange-500/50 bg-orange-500/5' : ''}`}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(column.id)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-700/50">
              <div className="flex items-center gap-2">
                <span className="text-lg">{column.icon}</span>
                <h3 className={`font-semibold ${column.color}`}>{column.title}</h3>
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                {columnTasks.length}
              </span>
            </div>
            
            {/* Tasks */}
            <div className="space-y-3 min-h-[300px]">
              {columnTasks.map(task => {
                const priority = priorityConfig[task.priority]
                const subtaskProgress = getSubtaskProgress(task.subtasks)
                const dueInfo = task.dueDate ? formatDueDate(task.dueDate) : null
                
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onClick={() => onTaskClick?.(task)}
                    className={`
                      kanban-card border-l-4 ${priority.border}
                      ${draggedTask === task.id ? 'opacity-40 scale-95' : 'opacity-100'}
                      hover:border-l-orange-500 cursor-pointer
                    `}
                  >
                    {/* Header: Project + Priority */}
                    <div className="flex items-center justify-between mb-2">
                      {task.project ? (
                        <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
                          {task.project}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priority.bg} ${priority.text}`}>
                        {priorityLabels[task.priority]}
                      </span>
                    </div>
                    
                    {/* Title */}
                    <h4 className="font-semibold text-sm mb-1 line-clamp-2">{task.title}</h4>
                    
                    {/* Description */}
                    {task.description && (
                      <p className="text-xs text-zinc-400 line-clamp-2 mb-3">
                        {task.description}
                      </p>
                    )}
                    
                    {/* Subtasks Progress */}
                    {subtaskProgress && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-zinc-500">Subtasks</span>
                          <span className="text-zinc-400">
                            {subtaskProgress.completed}/{subtaskProgress.total}
                          </span>
                        </div>
                        <div className="h-1.5 bg-zinc-700/50 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-300"
                            style={{ width: `${subtaskProgress.percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Tags */}
                    {task.tags && task.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-3">
                        {task.tags.slice(0, 3).map(tag => (
                          <span 
                            key={tag}
                            className="text-xs bg-zinc-700/50 text-zinc-400 px-2 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                        {task.tags.length > 3 && (
                          <span className="text-xs text-zinc-500">+{task.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                    
                    {/* Footer: Due Date + Assignee */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-700/30">
                      {dueInfo ? (
                        <span className={`text-xs px-2 py-0.5 rounded ${dueInfo.class}`}>
                          📅 {dueInfo.text}
                        </span>
                      ) : (
                        <span />
                      )}
                      {task.assignee && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-xs font-bold text-white">
                            {task.assignee.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-zinc-500">{task.assignee}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              
              {columnTasks.length === 0 && (
                <div className={`
                  text-center py-12 rounded-lg border-2 border-dashed 
                  ${isOver ? 'border-orange-500/50 bg-orange-500/5' : 'border-zinc-700/50'}
                  transition-all duration-200
                `}>
                  <p className="text-zinc-600 text-sm">
                    {isOver ? 'Drop here' : 'No tasks'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Add Task Modal - Enhanced
export function AddTaskModal({ 
  isOpen, 
  onClose, 
  onAdd 
}: { 
  isOpen: boolean
  onClose: () => void
  onAdd: (task: Omit<KanbanTask, 'id'>) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<KanbanTask['priority']>('medium')
  const [status, setStatus] = useState<KanbanTask['status']>('todo')
  const [project, setProject] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [tags, setTags] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    
    onAdd({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      status,
      project: project.trim() || undefined,
      dueDate: dueDate || undefined,
      tags: tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      createdAt: new Date().toISOString(),
    })
    
    // Reset form
    setTitle('')
    setDescription('')
    setPriority('medium')
    setStatus('todo')
    setProject('')
    setDueDate('')
    setTags('')
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Create Task</h2>
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors text-xl"
          >
            ✕
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm text-zinc-400 block mb-1.5">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
            />
          </div>
          
          {/* Description */}
          <div>
            <label className="text-sm text-zinc-400 block mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={3}
            />
          </div>
          
          {/* Row: Project + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 block mb-1.5">Project</label>
              <select value={project} onChange={e => setProject(e.target.value)}>
                <option value="">None</option>
                <option value="DealBot">DealBot</option>
                <option value="Mission Control">Mission Control</option>
                <option value="AI Automation">AI Automation</option>
                <option value="Fitness">Fitness</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as KanbanTask['priority'])}>
                <option value="low">🟢 Low</option>
                <option value="medium">🔵 Medium</option>
                <option value="high">🟠 High</option>
                <option value="critical">🔴 Critical</option>
              </select>
            </div>
          </div>
          
          {/* Row: Status + Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 block mb-1.5">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as KanbanTask['status'])}>
                <option value="backlog">📋 Backlog</option>
                <option value="todo">📝 To Do</option>
                <option value="in_progress">🔄 In Progress</option>
                <option value="done">✅ Done</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-1.5">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>
          
          {/* Tags */}
          <div>
            <label className="text-sm text-zinc-400 block mb-1.5">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="frontend, bug, feature..."
            />
          </div>
          
          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">
              Cancel
            </button>
            <button type="submit" className="flex-1 btn-primary" disabled={!title.trim()}>
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
