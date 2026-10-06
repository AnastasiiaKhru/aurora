import type { TeamAssignMode, TeamId } from '../types/Team.ts'

export function resolveTeam(
  preferred: TeamId | undefined,
  mode: TeamAssignMode,
  counts: { red: number; blue: number },
): TeamId {
  if (mode === 'alternate') return counts.red <= counts.blue ? 'red' : 'blue'
  if (mode === 'random') return Math.random() < 0.5 ? 'red' : 'blue'
  return preferred ?? (counts.red <= counts.blue ? 'red' : 'blue')
}

export function otherTeam(team: TeamId): TeamId {
  return team === 'red' ? 'blue' : 'red'
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

export function chatAction(text: string): { type: 'join'; team: TeamId } | { type: 'comment' } {
  const team = teamCommand(text)
  if (team) return { type: 'join', team }
  return { type: 'comment' }
}
