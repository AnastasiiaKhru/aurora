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
}
