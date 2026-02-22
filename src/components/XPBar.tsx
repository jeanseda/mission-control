import { useEffect, useMemo, useState } from 'react'

export interface XPData {
  level: number
  xp: number
  xpToNext: number
  title: string
  totalXpEarned: number
  history: Array<{ id?: string; source?: string; amount?: number; timestamp?: string }>
}

const getTitleFromLevel = (level: number) => {
  if (level <= 1) return 'Recruit'
  if (level <= 5) return 'Operator'
  if (level <= 10) return 'Commander'
  if (level <= 20) return 'Architect'
  return 'Emperor'
}

export function XPBar({ xpData }: { xpData: XPData }) {
  const [displayXP, setDisplayXP] = useState(0)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [lastLevel, setLastLevel] = useState(xpData.level)

  const levelTitle = useMemo(() => getTitleFromLevel(xpData.level), [xpData.level])
  const progress = Math.min(100, Math.round((xpData.xp / Math.max(1, xpData.xpToNext)) * 100))

  useEffect(() => {
    const target = xpData.xp
    const step = Math.max(1, Math.ceil(Math.abs(target - displayXP) / 24))
    const timer = setInterval(() => {
      setDisplayXP(prev => {
        if (prev === target) return prev
        if (prev < target) return Math.min(target, prev + step)
        return Math.max(target, prev - step)
      })
    }, 20)

    return () => clearInterval(timer)
  }, [xpData.xp, displayXP])

  useEffect(() => {
    if (xpData.level > lastLevel) {
      setShowLevelUp(true)
      const timer = setTimeout(() => setShowLevelUp(false), 1800)
      setLastLevel(xpData.level)
      return () => clearTimeout(timer)
    }
  }, [xpData.level, lastLevel])

  return (
    <div className="card relative overflow-hidden">
      {showLevelUp && <div className="level-up-burst">LEVEL UP!</div>}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-400">Experience</p>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-400">Level {xpData.level}</p>
          <p className="text-sm text-zinc-400">{levelTitle || xpData.title}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Total XP</p>
          <p className="text-xl font-bold mono">{xpData.totalXpEarned.toLocaleString()}</p>
        </div>
      </div>

      <div className="progress-bar h-3 sm:h-4 xp-progress">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center justify-between mt-2 text-xs sm:text-sm text-zinc-400 mono">
        <span>{displayXP} XP</span>
        <span>{Math.max(0, xpData.xpToNext - xpData.xp)} XP to next</span>
      </div>
    </div>
  )
}
