import { battleConfig } from '../config/battleConfig.ts'
import type { BattleStatus, TimerPhase, VictoryPortrait, VictoryResult, VictoryState, WinCondition } from '../types/Battle.ts'
import type { LeaderboardEntry } from '../types/Player.ts'
import type { TeamId, TeamState } from '../types/Team.ts'

export interface TimerSignals {
  changed: boolean
  enteredRush: boolean
  finalSecond: number | null
  expired: boolean
  roundOver: boolean
}

export class BattleSystem {
  status: BattleStatus = 'countdown'
  endless = true
  elapsedMs = 0
  durationMs = battleConfig.defaultDurationMs
  timeLeftMs = battleConfig.defaultDurationMs
  phase: TimerPhase = 'normal'
  winCondition: WinCondition = battleConfig.winCondition
  victory: VictoryState | null = null
  victoryElapsed = 0
  victoryEndsAt = 0
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

  tick(dt: number): TimerSignals {
    const signals: TimerSignals = { changed: false, enteredRush: false, finalSecond: null, expired: false, roundOver: false }
    if (this.status === 'victory') {
      if (this.victoryEndsAt <= 0) this.victoryEndsAt = Date.now() + battleConfig.victoryHoldMs
      this.victoryElapsed = Math.max(0, Math.min(battleConfig.victoryHoldMs, Date.now() - (this.victoryEndsAt - battleConfig.victoryHoldMs)))
      if (Date.now() >= this.victoryEndsAt) signals.roundOver = true
      return signals
    }
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
        this.timeLeftMs = 0
        signals.expired = true
        signals.changed = true
      }
    }
    return signals
  }

  wipeWinner(): VictoryResult | null {
    if (this.status !== 'running') return null
    if (this.red.health > 0 && this.blue.health > 0) return null
    return this.winnerFromScore()
  }

  winnerFromScore(): VictoryResult {
    if (this.red.health <= 0 && this.blue.health > 0) return 'blue'
    if (this.blue.health <= 0 && this.red.health > 0) return 'red'
    if (this.red.score > this.blue.score) return 'red'
    if (this.blue.score > this.red.score) return 'blue'
    return 'draw'
  }

  lockVictory(result: VictoryResult, top: LeaderboardEntry[], portraits: VictoryPortrait[]): boolean {
    if (this.status === 'victory' || this.status === 'resetting' || this.victory) return false
    const redScore = Math.round(this.red.score)
    const blueScore = Math.round(this.blue.score)
    if (result === 'red') this.blue.health = 0
    else if (result === 'blue') this.red.health = 0
    const ranked = top.filter((entry) => entry.battlePoints > 0).slice(0, 3)
    this.status = 'victory'
    this.phase = 'finished'
    this.timeLeftMs = 0
    this.finishingLeft = 0
    this.victoryElapsed = 0
    this.victoryEndsAt = Date.now() + battleConfig.victoryHoldMs
    this.victory = { result, redScore, blueScore, mvp: ranked[0] ?? null, top: ranked, portraits }
    return true
  }

  markResetting(): void {
    this.status = 'resetting'
    this.victory = null
    this.victoryElapsed = 0
    this.victoryEndsAt = 0
  }

  beginCountdown(): void {
    const endless = this.endless
    const durationMs = this.durationMs
    const winCondition = this.winCondition
    this.status = 'countdown'
    this.endless = endless
    this.durationMs = durationMs
    this.winCondition = winCondition
    this.elapsedMs = 0
    this.timeLeftMs = durationMs
    this.phase = 'normal'
    this.victory = null
    this.victoryElapsed = 0
    this.victoryEndsAt = 0
    this.finishingLeft = 0
    this.finalSecond = -1
    this.finalTen = null
    this.red = createTeam('red')
    this.blue = createTeam('blue')
  }

  setDuration(ms: number): void {
    this.endless = false
    this.durationMs = ms
    this.timeLeftMs = ms
    this.phase = 'normal'
    this.finalSecond = -1
    this.finalTen = null
    this.victory = null
    this.victoryElapsed = 0
    this.victoryEndsAt = 0
    if (this.status === 'victory' || this.status === 'resetting') this.status = 'paused'
  }

  jumpTo(ms: number): void {
    if (this.status === 'victory' || this.status === 'resetting') return
    if (ms <= 0) {
      this.endless = false
      this.timeLeftMs = 0
      this.status = 'running'
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
    if (this.status === 'victory' || this.status === 'resetting') return
    this.endless = true
    this.phase = 'normal'
    this.finalSecond = -1
    this.finalTen = null
    this.victory = null
  }

  recomputePhase(): void {
    if (this.timeLeftMs <= 0) this.phase = 'finished'
    else if (this.timeLeftMs <= battleConfig.finalTenMs) this.phase = 'final_10'
    else if (this.timeLeftMs <= battleConfig.finalRushMs) this.phase = 'final_rush'
    else this.phase = 'normal'
  }

  capture(): {
    status: BattleStatus
    endless: boolean
    elapsedMs: number
    durationMs: number
    timeLeftMs: number
    phase: TimerPhase
    winCondition: WinCondition
    victory: VictoryState | null
    victoryElapsed: number
    victoryEndsAt: number
    finishingLeft: number
    finalTen: { value: number; nonce: number } | null
    red: TeamState
    blue: TeamState
  } {
    return {
      status: this.status,
      endless: this.endless,
      elapsedMs: this.elapsedMs,
      durationMs: this.durationMs,
      timeLeftMs: this.timeLeftMs,
      phase: this.phase,
      winCondition: this.winCondition,
      victory: this.victory,
      victoryElapsed: this.victoryElapsed,
      victoryEndsAt: this.victoryEndsAt,
      finishingLeft: this.finishingLeft,
      finalTen: this.finalTen,
      red: { ...this.red },
      blue: { ...this.blue },
    }
  }

  apply(state: Omit<ReturnType<BattleSystem['capture']>, 'victoryEndsAt'> & { victoryEndsAt?: number }, gapMs = 0): void {
    this.status = normalizeStatus(state.status)
    this.endless = state.endless
    this.durationMs = state.durationMs
    this.phase = state.phase
    this.winCondition = state.winCondition
    const savedVictory = state.victory
    this.victory = savedVictory ? { ...savedVictory, portraits: Array.isArray(savedVictory.portraits) ? savedVictory.portraits : [] } : null
    this.finalTen = state.finalTen
    this.red = { ...state.red }
    this.blue = { ...state.blue }
    this.elapsedMs = state.elapsedMs
    this.timeLeftMs = state.timeLeftMs
    this.finishingLeft = state.finishingLeft
    this.victoryElapsed = typeof state.victoryElapsed === 'number' ? state.victoryElapsed : 0
    this.victoryEndsAt = typeof state.victoryEndsAt === 'number' ? state.victoryEndsAt : 0
    if (this.status === 'victory' && this.victoryEndsAt <= 0) {
      const remain = Math.max(0, battleConfig.victoryHoldMs - this.victoryElapsed)
      this.victoryEndsAt = Date.now() + remain
    }
    if (gapMs <= 0) return
    if (this.status === 'running' && this.endless) this.elapsedMs += gapMs
    else if (this.status === 'running') this.timeLeftMs = Math.max(0, this.timeLeftMs - gapMs)
  }

  reset(): void {
    this.status = 'countdown'
    this.endless = true
    this.elapsedMs = 0
    this.durationMs = battleConfig.defaultDurationMs
    this.timeLeftMs = this.durationMs
    this.phase = 'normal'
    this.victory = null
    this.victoryElapsed = 0
    this.victoryEndsAt = 0
    this.finishingLeft = 0
    this.finalSecond = -1
    this.finalTen = null
    this.red = createTeam('red')
    this.blue = createTeam('blue')
  }

}

function normalizeStatus(status: string): BattleStatus {
  if (status === 'finishing' || status === 'finished' || status === 'victory') return 'victory'
  if (status === 'running' || status === 'paused' || status === 'countdown' || status === 'resetting') return status
  return 'countdown'
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
