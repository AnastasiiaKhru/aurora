import type { TeamId } from './types.ts'

/**
 * Remembers who fights for which side for this bridge session.
 * A chat choice replaces whatever side they were given on first sight.
 */
export class SessionTeams {
  private readonly assigned = new Map<string, TeamId>()

  teamFor(userId: string): TeamId {
    const current = this.assigned.get(userId)
    if (current) return current
    const team: TeamId = Math.random() < 0.5 ? 'red' : 'blue'
    this.assigned.set(userId, team)
    return team
  }

  assign(userId: string, team: TeamId): void {
    this.assigned.set(userId, team)
  }
}

/** A whole comment of C/Canada or U/USA. Words like "cute" or "c u later" stay ordinary chat. */
export function teamCommand(text: string): TeamId | null {
  const command = String(text ?? '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\u00a0/g, ' ').trim().toLowerCase()
  if (command === 'c' || command === 'canada') return 'red'
  if (command === 'u' || command === 'usa') return 'blue'
  return null
}
