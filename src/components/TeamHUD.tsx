import { useEffect, useRef, useState } from 'react'
import { battleConfig } from '../config/battleConfig.ts'
import type { TeamState } from '../types/Team.ts'
import { formatScore } from '../utils/format.ts'
import { useAnimatedNumber } from './useAnimatedNumber.ts'

export function TeamHUD({ team, side, share }: { team: TeamState; side: 'left' | 'right'; share: number }) {
  const score = useAnimatedNumber(team.score)
  const health = team.maxHealth <= 0 ? 0 : Math.max(0, Math.min(100, (team.health / team.maxHealth) * 100))
  const pips = Math.round(team.momentum * 5)
  const [scorePulse, setScorePulse] = useState(false)
  const [ghost, setGhost] = useState(health)
  const ghostRef = useRef(health)

  useEffect(() => {
    setScorePulse(true)
    const timer = window.setTimeout(() => setScorePulse(false), 280)
    return () => window.clearTimeout(timer)
  }, [team.score])

  useEffect(() => {
    if (health >= ghostRef.current - 0.05) {
      ghostRef.current = health
      setGhost(health)
      return
    }
    const timer = window.setTimeout(() => {
      ghostRef.current = health
      setGhost(health)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [health])

  return (
    <section className={`team-hud team-${team.id} side-${side}`} aria-label={`${battleConfig.teamNames[team.id]} team`}>
      <div className="team-name">
        <span className="team-flag" aria-hidden="true">{team.id === 'red' ? <img src="/maple-leaf.png" alt="" /> : <UsaStar />}</span>
        <span>{battleConfig.teamNames[team.id]}</span>
      </div>
      <div className={`team-score${scorePulse ? ' hit' : ''}`}>{share}%</div>
      <div className="team-points">{formatScore(score)}</div>
      <div className="territory" title="Territory strength">
        <div className="territory-ghost" style={{ width: `${ghost}%` }} />
        <div className="territory-fill" style={{ width: `${health}%` }} />
      </div>
      <div className="team-meta">
        <span className="fighters">{team.playerCount}</span>
        <span className="momentum" aria-label={`${battleConfig.teamNames[team.id]} momentum`}>
          {Array.from({ length: 5 }, (_, index) => (
            <i key={index} className={index < pips ? 'on' : ''} />
          ))}
        </span>
      </div>
    </section>
  )
}

function UsaStar() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M8 1.2 9.7 5.4 14.2 5.7 10.8 8.6 11.9 13 8 10.7 4.1 13 5.2 8.6 1.8 5.7 6.3 5.4 8 1.2z" />
    </svg>
  )
}

