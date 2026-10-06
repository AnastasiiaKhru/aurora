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

export function teamCommand(text: string): TeamId | null {
  const command = text.trim().toLowerCase().replace(/[\u200b-\u200d\ufeff]/g, '')
  const isCanadaCommand = command === 'c' || command === 'canada'
  const isUsaCommand =
    command === 'u' ||
    command === 'usa' ||
    command === 'u.s.a.' ||
    command === 'united states'
  if (isCanadaCommand) return 'red'
  if (isUsaCommand) return 'blue'
  return null
}
