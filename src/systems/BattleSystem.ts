import { battleConfig } from '../config/battleConfig.ts'
import type { BattleStatus, TimerPhase, VictoryState, WinCondition } from '../types/Battle.ts'
import type { LeaderboardEntry } from '../types/Player.ts'
import type { TeamId, TeamState } from '../types/Team.ts'

export interface TimerSignals {
  changed: boolean
  enteredRush: boolean
  finalSecond: number | null
  justFinished: boolean
}

export class BattleSystem {
  status: BattleStatus = 'running'
  endless = true
  elapsedMs = 0
  durationMs = battleConfig.defaultDurationMs
  timeLeftMs = battleConfig.defaultDurationMs
  phase: TimerPhase = 'normal'
  winCondition: WinCondition = battleConfig.winCondition
  victory: VictoryState | null = null
  finishingLeft = 0
  finalTen: { value: number; nonce: number } | null = null
  red: TeamState
  blue: TeamState
  private finalSecond = -1
  private tenNonce = 1

  constructor() {
    this.red = createTeam('red')
    this.blue = createTeam('blue')
  }

  team(id: TeamId): TeamState {
    return id === 'red' ? this.red : this.blue
  }

  tick(dt: number, leaders: () => LeaderboardEntry[]): TimerSignals {
    const signals: TimerSignals = { changed: false, enteredRush: false, finalSecond: null, justFinished: false }
    if (this.status === 'running' && this.endless) {
      this.elapsedMs += dt * 1000
      if (this.phase !== 'normal') {
        this.phase = 'normal'
        signals.changed = true
      }
    } else if (this.status === 'running') {
      const before = this.phase
      this.timeLeftMs = Math.max(0, this.timeLeftMs - dt * 1000)
      this.recomputePhase()
      if (this.phase !== before) signals.changed = true
      if (before !== 'final_rush' && this.phase === 'final_rush') {
        signals.enteredRush = true
      }
      if (this.phase === 'final_10') {
        const second = Math.ceil(this.timeLeftMs / 1000)
        if (second !== this.finalSecond && second >= 1 && second <= 10) {
          this.finalSecond = second
          this.finalTen = { value: second, nonce: this.tenNonce++ }
          signals.finalSecond = second
          signals.changed = true
        }
      }
      if (this.timeLeftMs <= 0) {
        this.beginFinishing()
        signals.changed = true
      }
    } else if (this.status === 'finishing') {
      this.finishingLeft -= dt * 1000
      if (this.finishingLeft <= 0) {
        this.status = 'finished'
        this.phase = 'finished'
        this.victory = this.makeVictory(leaders())
        signals.justFinished = true
        signals.changed = true
      }
    }
    return signals
  }

  checkWipe(): boolean {
    if (this.winCondition !== 'destroy_territory') return false
    if (this.status !== 'running') return false
    if (this.red.health > 0 && this.blue.health > 0) return false
    this.timeLeftMs = 0
    this.beginFinishing()
    return true
  }

  setDuration(ms: number): void {
    this.endless = false
    this.durationMs = ms
    this.timeLeftMs = ms
    this.phase = 'normal'
    this.finalSecond = -1
    this.finalTen = null
    this.victory = null
    if (this.status === 'finished' || this.status === 'finishing') this.status = 'paused'
  }

  jumpTo(ms: number): void {
    if (this.status === 'finished') return
    if (ms <= 0) {
      this.stop()
      return
    }
    this.endless = false
    this.timeLeftMs = ms
    this.status = 'running'
    this.victory = null
    this.finalSecond = -1
    this.recomputePhase()
  }

  runForever(): void {
    if (this.status === 'finished' || this.status === 'finishing') return
    this.endless = true
    this.phase = 'normal'
    this.finalSecond = -1
    this.finalTen = null
    this.victory = null
  }

  stop(): void {
    this.beginFinishing()
  }

  beginFinishing(): void {
    if (this.status === 'finishing' || this.status === 'finished') return
    this.status = 'finishing'
    this.phase = 'finished'
    this.timeLeftMs = 0
    this.finishingLeft = battleConfig.finishingMs
  }

  recomputePhase(): void {
    if (this.timeLeftMs <= 0) this.phase = 'finished'
    else if (this.timeLeftMs <= battleConfig.finalTenMs) this.phase = 'final_10'
    else if (this.timeLeftMs <= battleConfig.finalRushMs) this.phase = 'final_rush'
    else this.phase = 'normal'
  }

  reset(): void {
    this.status = 'running'
    this.endless = true
    this.elapsedMs = 0
    this.durationMs = battleConfig.defaultDurationMs
    this.timeLeftMs = this.durationMs
    this.phase = 'normal'
    this.victory = null
    this.finishingLeft = 0
    this.finalSecond = -1
    this.finalTen = null
    this.red = createTeam('red')
    this.blue = createTeam('blue')
  }

  private makeVictory(leaders: LeaderboardEntry[]): VictoryState {
    const redScore = Math.round(this.red.score)
    const blueScore = Math.round(this.blue.score)
    let result: VictoryState['result'] = 'draw'
    if (this.winCondition === 'destroy_territory' && this.red.health <= 0 && this.blue.health > 0) result = 'blue'
    else if (this.winCondition === 'destroy_territory' && this.blue.health <= 0 && this.red.health > 0) result = 'red'
    else if (redScore > blueScore) result = 'red'
    else if (blueScore > redScore) result = 'blue'
    const mvp = leaders.find((entry) => entry.battlePoints > 0) ?? null
    return { result, redScore, blueScore, mvp, top: leaders.slice(0, 3) }
  }
}

function createTeam(id: TeamId): TeamState {
  return {
    id,
    name: battleConfig.teamNames[id],
    score: 0,
    health: battleConfig.maxHealth,
    maxHealth: battleConfig.maxHealth,
    playerCount: 0,
    momentum: 0,
    likesTotal: 0,
    likeBank: 0,
  }
}

export function riftTarget(red: TeamState, blue: TeamState): number {
  const scoreTotal = red.score + blue.score
  const scorePush = scoreTotal <= 0 ? 0 : (red.score - blue.score) / scoreTotal
  const healthPush = (red.health - blue.health) / Math.max(1, red.maxHealth)
  const momentumPush = (red.momentum - blue.momentum) * 0.35
  const push = clampPush(scorePush * 0.62 + healthPush * 0.4 + momentumPush * 0.22)
  return 0.5 + push * battleConfig.riftMaxShift
}

function clampPush(value: number): number {
  return Math.max(-1, Math.min(1, value))
}
