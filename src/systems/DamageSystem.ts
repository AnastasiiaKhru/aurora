import type { TeamId, TeamState } from '../types/Team.ts'

export class DamageSystem {
  apply(attacker: TeamId, amount: number, red: TeamState, blue: TeamState): { target: TeamId; dealt: number } {
    const target = attacker === 'red' ? blue : red
    const dealt = Math.max(0, Math.min(target.health, amount))
    target.health = Math.max(0, target.health - dealt)
    return { target: target.id, dealt }
  }
}
