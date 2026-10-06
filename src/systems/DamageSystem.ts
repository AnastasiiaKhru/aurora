import type { TeamId, TeamState } from '../types/Team.ts'

export class DamageSystem {
  apply(attacker: TeamId, amount: number, red: TeamState, blue: TeamState): { target: TeamId; dealt: number; next: number } {
    const target = attacker === 'red' ? blue : red
    const before = Number.isFinite(target.health) ? Math.max(0, target.health) : 0
    const hit = Number.isFinite(amount) ? Math.max(0, amount) : 0
    const dealt = Math.min(before, hit)
    const next = before - dealt
    target.health = next
    return { target: target.id, dealt, next }
  }
}
