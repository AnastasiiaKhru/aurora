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
