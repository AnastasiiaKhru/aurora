import type { TeamId, TeamState } from '../types/Team.ts'
import { formatScore } from '../utils/format.ts'
import { useAnimatedNumber } from './useAnimatedNumber.ts'

export function TeamHUD({ team, side }: { team: TeamState; side: 'left' | 'right' }) {
  const score = useAnimatedNumber(team.score)
  const health = team.maxHealth <= 0 ? 0 : Math.max(0, Math.min(100, (team.health / team.maxHealth) * 100))
  const pips = Math.round(team.momentum * 5)

  return (
    <section className={`team-hud team-${team.id} side-${side}`} aria-label={`${team.name} team`}>
      <div className="team-name">
        <Sigil team={team.id} />
        <span>{team.name}</span>
      </div>
      <div className="team-score">{formatScore(score)}</div>
      <div className="territory" title="Territory strength">
        <div className={`territory-fill ${health < 28 ? 'low' : ''}`} style={{ width: `${health}%` }} />
      </div>
      <div className="team-meta">
        <span className="fighters">{team.playerCount}</span>
        <span className="momentum" aria-label={`${team.name} momentum`}>
          {Array.from({ length: 5 }, (_, index) => (
            <i key={index} className={index < pips ? 'on' : ''} />
          ))}
        </span>
      </div>
    </section>
  )
}

function Sigil({ team }: { team: TeamId }) {
  if (team === 'red') {
    return (
      <svg className="sigil" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5l1.4 4.2L14 7.2 9.4 9.6 8 14.5 6.6 9.6 2 7.2l4.6-1.5L8 1.5z" />
      </svg>
    )
  }
  return (
    <svg className="sigil" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.2l2.2 4.6L15 8l-4.8 2.2L8 14.8 5.8 10.2 1 8l4.8-2.2L8 1.2z" />
    </svg>
  )
}
