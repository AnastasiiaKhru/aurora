import { useEffect, useRef, useState } from 'react'
import { battleConfig } from '../config/battleConfig.ts'
import { director } from '../systems/GameDirector.ts'
import { teamHealthBar, teamHealthPercent } from '../systems/BattleSystem.ts'
import { isNpcId } from '../systems/attractMode.ts'
import type { TeamId, TeamState } from '../types/Team.ts'
import { formatScore } from '../utils/format.ts'
import { useAnimatedNumber } from './useAnimatedNumber.ts'

export function TeamHUD({ team, side }: { team: TeamState; side: 'left' | 'right' }) {
  const score = useAnimatedNumber(team.score)
  const plate = fighterPlate(team.id)
  const teamBar = teamHealthBar(team.health, team.maxHealth)
  const teamShown = teamHealthPercent(team.health, team.maxHealth)
  const health = plate ? Math.min(teamBar, plate.bar) : teamBar
  const shown = plate ? Math.min(teamShown, plate.shown) : teamShown
  const pips = Math.round(team.momentum * 5)
  const [scorePulse, setScorePulse] = useState(false)
  const [hurt, setHurt] = useState(false)
  const [ghost, setGhost] = useState(health)
  const [delta, setDelta] = useState(0)
  const ghostRef = useRef(health)
  const scoreRef = useRef(team.score)

  useEffect(() => {
    const gained = Math.round(team.score - scoreRef.current)
    scoreRef.current = team.score
    setScorePulse(true)
    const timer = window.setTimeout(() => setScorePulse(false), 280)
    if (gained <= 0) return () => window.clearTimeout(timer)
    setDelta(gained)
    const fade = window.setTimeout(() => setDelta(0), 720)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(fade)
    }
  }, [team.score])

  useEffect(() => {
    if (health >= ghostRef.current - 0.05) {
      ghostRef.current = health
      setGhost(health)
      return
    }
    setHurt(true)
    const flash = window.setTimeout(() => setHurt(false), 320)
    const timer = window.setTimeout(() => {
      ghostRef.current = health
      setGhost(health)
    }, 300)
    return () => {
      window.clearTimeout(flash)
      window.clearTimeout(timer)
    }
  }, [health])

  return (
    <section className={`team-hud team-${team.id} side-${side}${hurt ? ' hurt' : ''}`} aria-label={`${battleConfig.teamNames[team.id]} team`}>
      <div className="team-name">
        {team.id === 'red' ? (
          <>
            <CanadaFlag />
            <span className="join-key">C</span>
            <span className="join-dot" aria-hidden="true">·</span>
            <span className="team-label">CANADA</span>
          </>
        ) : (
          <>
            <span className="team-label">USA</span>
            <span className="join-dot" aria-hidden="true">·</span>
            <span className="join-key">U</span>
            <UsaFlag />
          </>
        )}
      </div>
      <div className={`team-score${scorePulse || hurt ? ' hit' : ''}`}>{shown}%</div>
      <div className="territory" title="Territory strength">
        <div className="territory-ghost" style={{ width: `${ghost}%` }} />
        <div className="territory-fill" style={{ width: `${health}%` }}>
          <i className="territory-glint" />
        </div>
      </div>
      <div className="team-attack" aria-label={`${battleConfig.teamNames[team.id]} attack total`}>
        <span className="bolt" aria-hidden="true">⚡</span>
        <span className="team-points">{formatScore(score)}</span>
        {delta > 0 && <em className="score-delta">+{formatScore(delta)}</em>}
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

/** Plate percent follows the fighters still standing, so it leaves 100 as soon as that side is hit. */
function fighterPlate(teamId: TeamId): { shown: number; bar: number } | null {
  const roster = teamId === 'red' ? battleConfig.rosterRed : battleConfig.rosterBlue
  let hp = 0
  let counted = 0
  for (const player of director.players.players.values()) {
    if (player.team !== teamId || player.isNpc || isNpcId(player.id)) continue
    counted += 1
    const body = director.players.bodies.get(player.id)
    if (!body || body.hp <= 0 || body.dying > 0) continue
    hp += body.hp
  }
  const slots = Math.max(roster, counted)
  if (slots <= 0) return null
  const max = slots * battleConfig.playerHealth
  return { shown: teamHealthPercent(hp, max), bar: teamHealthBar(hp, max) }
}

function CanadaFlag() {
  return (
    <svg className="team-flag" viewBox="0 0 16 11" aria-hidden="true">
      <rect width="16" height="11" rx="1" fill="#fff" />
      <rect width="4.2" height="11" fill="#d80621" />
      <rect x="11.8" width="4.2" height="11" fill="#d80621" />
      <path fill="#d80621" d="M8 2.1 8.7 4.1 10.9 4 9.2 5.2 9.9 7.2 8 6 6.1 7.2 6.8 5.2 5.1 4 7.3 4.1Z" />
    </svg>
  )
}

function UsaFlag() {
  return (
    <svg className="team-flag" viewBox="0 0 16 11" aria-hidden="true">
      <rect width="16" height="11" rx="1.2" fill="#b22234" />
      <rect y="1.6" width="16" height="1.15" fill="#fff" />
      <rect y="3.9" width="16" height="1.15" fill="#fff" />
      <rect y="6.2" width="16" height="1.15" fill="#fff" />
      <rect y="8.5" width="16" height="1.15" fill="#fff" />
      <rect width="7.1" height="5.9" fill="#3c3b6e" />
    </svg>
  )
}

