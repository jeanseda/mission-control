import { useEffect, useState } from 'react'

interface Stats {
  tasksDone: number
  daysActive: number
  agentsRunning: number
  skillsBuilt: number
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const step = Math.max(1, Math.ceil(value / 30))
    const timer = setInterval(() => {
      setDisplay(prev => {
        if (prev >= value) return value
        return Math.min(value, prev + step)
      })
    }, 24)

    return () => clearInterval(timer)
  }, [value])

  return <span>{display}</span>
}

export function StatsCard({ stats }: { stats: Stats }) {
  const items = [
    { label: 'Tasks Done', value: stats.tasksDone, icon: '✅' },
    { label: 'Days Active', value: stats.daysActive, icon: '🔥' },
    { label: 'Agents Running', value: stats.agentsRunning, icon: '🤖' },
    { label: 'Skills Built', value: stats.skillsBuilt, icon: '🛠️' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {items.map(item => (
        <div key={item.label} className="stat-card">
          <p className="text-xs sm:text-sm text-zinc-400 flex items-center gap-2">
            <span>{item.icon}</span>
            {item.label}
          </p>
          <p className="text-2xl sm:text-3xl font-bold mt-2 gradient-text mono">
            <AnimatedNumber value={item.value} />
          </p>
        </div>
      ))}
    </div>
  )
}
