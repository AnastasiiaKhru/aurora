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
      label: team === 'red' ? 'RED RUSH' : 'BLUE RUSH',
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
}
