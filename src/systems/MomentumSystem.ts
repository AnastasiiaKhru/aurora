import { battleConfig } from '../config/battleConfig.ts'
import type { RushCallout } from '../types/Battle.ts'
import type { TeamId, TeamState } from '../types/Team.ts'
import { clamp } from '../utils/math.ts'

interface GiftPing {
  team: TeamId
  userId: string
  at: number
}

export class MomentumSystem {
  rush: RushCallout | null = null
  private rushUntil = 0
  private recent: GiftPing[] = []
  private nonce = 1

  registerGift(team: TeamId, userId: string, value: number, now: number, state: TeamState): RushCallout | null {
    this.recent.push({ team, userId, at: now })
    this.recent = this.recent.filter((ping) => now - ping.at <= battleConfig.rushWindowMs)
    const bump = Math.min(0.36, 0.05 + Math.log10(value + 10) * 0.07)
    state.momentum = clamp(state.momentum + bump, 0, 1)

    const unique = new Set(this.recent.filter((ping) => ping.team === team).map((ping) => ping.userId))
    if (unique.size < battleConfig.rushUniqueGifters) return null
    if (this.rush && this.rush.team === team && now < this.rushUntil) {
      this.rushUntil = now + battleConfig.rushDurationMs
      return null
    }
    this.rushUntil = now + battleConfig.rushDurationMs
    this.rush = {
      id: `rush-${this.nonce++}`,
      team,
      label: team === 'red' ? 'CANADA RUSH' : 'USA RUSH',
    }
    return this.rush
  }

  tick(dt: number, now: number, red: TeamState, blue: TeamState): void {
    red.momentum = Math.max(0, red.momentum - dt * 0.085)
    blue.momentum = Math.max(0, blue.momentum - dt * 0.085)
    if (this.rush && now > this.rushUntil) this.rush = null
  }

  reset(): void {
    this.rush = null
    this.rushUntil = 0
    this.recent = []
  }

  capture(now: number): MomentumSave {
    return {
      rushLeft: Math.max(0, this.rushUntil - now),
      nonce: this.nonce,
      recent: this.recent.map((ping) => ({ team: ping.team, userId: ping.userId, age: Math.max(0, now - ping.at) })),
    }
  }

  restore(save: MomentumSave | null | undefined, now: number): void {
    if (!save) return
    this.rushUntil = now + Math.max(0, save.rushLeft || 0)
    this.nonce = save.nonce || this.nonce
    this.recent = (save.recent ?? [])
      .filter((ping) => ping.age <= battleConfig.rushWindowMs)
      .map((ping) => ({ team: ping.team, userId: ping.userId, at: now - ping.age }))
  }
}

export interface MomentumSave {
  rushLeft: number
  nonce: number
  recent: { team: TeamId; userId: string; age: number }[]
}
