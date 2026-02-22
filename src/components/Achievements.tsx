import { useState } from 'react'

export interface Achievement {
  id: string
  icon: string
  name: string
  description: string
  unlocked: boolean
  progress?: string
}

export function Achievements({ achievements }: { achievements: Achievement[] }) {
  const [selected, setSelected] = useState<Achievement | null>(null)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {achievements.map(achievement => (
          <button
            key={achievement.id}
            onClick={() => setSelected(achievement)}
            className={`achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'}`}
          >
            <span className="text-2xl sm:text-3xl mb-2">{achievement.icon}</span>
            <p className="text-sm font-semibold leading-tight">{achievement.name}</p>
            <p className="text-xs mt-1 text-zinc-500">
              {achievement.unlocked ? 'Unlocked' : 'Locked'}
            </p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="card achievement-detail">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Badge Details</p>
              <p className="text-lg font-bold mt-1">
                {selected.icon} {selected.name}
              </p>
              <p className="text-sm text-zinc-400 mt-2">
                {selected.unlocked ? selected.description : '???'}
              </p>
              {selected.progress && (
                <p className="text-xs text-orange-400 mt-2">Progress: {selected.progress}</p>
              )}
            </div>
            <span className={`badge ${selected.unlocked ? 'badge-success' : 'badge-neutral'}`}>
              {selected.unlocked ? 'Unlocked' : 'Locked'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
