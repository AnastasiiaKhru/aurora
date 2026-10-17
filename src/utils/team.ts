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

const PAPER = new Set(['a', 'teama', 'notoiletpaper', 'toiletpaper', 'notp', 'c', 'ca', 'can', 'canada', 'canadian', 'canadians', 'maple', 'teamc', 'teamca', 'teamcanada', 'canda', 'cananda', 'cannada'])
const PHONE = new Set(['b', 'teamb', 'nophone', 'nophoneforamonth', 'u', 'us', 'usa', 'america', 'american', 'americans', 'teamu', 'teamus', 'teamusa', 'unitedstates'])

/** A whole comment that names one side. Sentences like "cute" or "c u later" stay ordinary chat. */
export function teamCommand(text: string): TeamId | null {
  const raw = String(text ?? '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\u00a0/g, ' ').trim().toLowerCase()
  if (raw === '🧻' || raw === '🇨🇦' || raw === '🍁') return 'red'
  if (raw === '📵' || raw === '🇺🇸') return 'blue'
  const command = raw.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z]/g, '')
  if (PAPER.has(command)) return 'red'
  if (PHONE.has(command)) return 'blue'
  return null
}

export function chatAction(text: string): { type: 'join'; team: TeamId } | { type: 'comment' } {
  const team = teamCommand(text)
  if (team) return { type: 'join', team }
  return { type: 'comment' }
}
