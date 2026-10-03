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
