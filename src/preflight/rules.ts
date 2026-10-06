import { battleConfig } from '../config/battleConfig.ts'
import type { TeamId } from '../types/Team.ts'

export const LIVE_CONFIRMATION =
  'Confirm that TikTok LIVE Studio displays the complete game, the scoreboard is visible, the top profile area is clear, the lower chat area is clear, and audio levels are safe.'

export function giftCountsTowardScore(event: { preview?: boolean; repeatEnd?: boolean; giftName: string }): boolean {
  if (event.preview) return false
  if (event.repeatEnd === false) return false
  if (/heart/i.test(event.giftName)) return false
  return true
}

export function acceptEvent(seen: Set<string>, id: string | undefined): boolean {
  if (!id) return true
  if (seen.has(id)) return false
  seen.add(id)
  if (seen.size > 4000) {
    const oldest = seen.values().next().value
    if (oldest) seen.delete(oldest)
  }
  return true
}

export function acceptSocial(seen: Set<string>, kind: 'follow' | 'share', identity: string): boolean {
  const name = identity.trim().toLowerCase()
  if (!name) return true
  return acceptEvent(seen, `${kind}:${name}`)
}

/** A socket that is still connecting or open must not be opened again. */
export function shouldOpenSocket(stopped: boolean, readyState: number | null): boolean {
  if (stopped) return false
  if (readyState === 0 || readyState === 1) return false
  return true
}

export function likeShotPlan(count: number): { amount: number; shots: number; damageEach: number; totalDamage: number } {
  const amount = Math.max(1, Math.round(count) || 1)
  const shots = amount <= 8 ? amount : Math.min(14, 6 + Math.ceil(Math.log2(amount)))
  const totalDamage = battleConfig.likeShotDamage * Math.min(amount, 5)
  return { amount, shots, damageEach: totalDamage / shots, totalDamage }
}

export type JoinDecision = 'create' | 'keep' | 'switch'

export function decideJoin(
  existing: { team: TeamId } | null,
  preferred: TeamId,
  explicit: boolean,
  locked: boolean,
): JoinDecision {
  if (!existing) return 'create'
  if (!explicit || locked) return 'keep'
  if (existing.team !== preferred) return 'switch'
  return 'keep'
}
