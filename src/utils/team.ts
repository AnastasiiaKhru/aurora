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

/** A whole comment of C/Canada or U/USA. Words like "cute" or "c u later" stay ordinary chat. */
export function teamCommand(text: string): TeamId | null {
  const command = String(text ?? '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\u00a0/g, ' ').trim().toLowerCase()
  if (command === 'c' || command === 'canada') return 'red'
  if (command === 'u' || command === 'usa') return 'blue'
  return null
}

export function chatAction(text: string): { type: 'join'; team: TeamId } | { type: 'comment' } {
  const team = teamCommand(text)
  if (team) return { type: 'join', team }
  return { type: 'comment' }
}
