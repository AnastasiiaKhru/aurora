import type { TeamId } from './Team.ts'

export interface Player {
  id: string
  username: string
  avatarUrl: string
  avatarKey: string
  initials: string
  team: TeamId
  giftValue: number
  battlePoints: number
  damageDealt: number
  giftCount: number
  largestCombo: number
  joinedAt: number
  isNpc?: boolean
  /** Set when this avatar receives a real viewer action, even if the id began as a field filler. */
  participated?: boolean
}

export interface LeaderboardEntry {
  id: string
  username: string
  avatarUrl: string
  initials: string
  team: TeamId
  giftValue: number
  battlePoints: number
  damageDealt: number
  giftCount: number
  largestCombo: number
  participated?: boolean
}
