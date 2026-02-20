import { useState } from 'react'

interface CalendarEvent {
  id: string
  title: string
  type: 'scheduled' | 'completed' | 'error'
  time: string
  schedule?: string
}

interface Props {
  events: CalendarEvent[]
}

export function CalendarGrid({ events }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date())
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  // Get first day of month and total days
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDay = firstDay.getDay()
  
  // Generate calendar days
  const days: Array<{ date: number | null; events: CalendarEvent[] }> = []
  
  // Empty cells before first day
  for (let i = 0; i < startingDay; i++) {
    days.push({ date: null, events: [] })
  }
  
  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayEvents = events.filter(e => e.time.startsWith(dateStr))
    days.push({ date: day, events: dayEvents })
  }
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const today = new Date()
  const isToday = (day: number) => 
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={prevMonth}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          ←
        </button>
        <h2 className="text-xl font-bold">
          {monthNames[month]} {year}
        </h2>
        <button 
          onClick={nextMonth}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          →
        </button>
      </div>
      
      {/* Day names */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map(day => (
          <div key={day} className="text-center text-xs text-zinc-500 font-medium py-2">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => (
          <div 
            key={i}
            className={`
              calendar-day min-h-[80px]
              ${day.date === null ? 'invisible' : ''}
              ${day.date && isToday(day.date) ? 'today' : ''}
            `}
          >
            {day.date && (
              <>
                <span className={`
                  text-sm font-medium
                  ${isToday(day.date) ? 'text-orange-400' : 'text-zinc-400'}
                `}>
                  {day.date}
                </span>
                <div className="mt-1 space-y-1">
                  {day.events.slice(0, 3).map(event => (
                    <div 
                      key={event.id}
                      className={`calendar-event ${event.type}`}
                      title={event.title}
                    >
                      {event.title}
                    </div>
                  ))}
                  {day.events.length > 3 && (
                    <div className="text-xs text-zinc-500">
                      +{day.events.length - 3} more
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex gap-4 mt-4 pt-4 border-t border-zinc-800 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-amber-500/40" />
          <span className="text-zinc-400">Scheduled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-500/40" />
          <span className="text-zinc-400">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-500/40" />
          <span className="text-zinc-400">Error</span>
        </div>
      </div>
    </div>
  )
}
