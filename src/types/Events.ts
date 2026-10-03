import type { TeamId } from './Team.ts'

export interface GiftEvent {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
  giftId: string
  giftName: string
  giftCount: number
  coinValue?: number
  repeatEnd?: boolean
}

export type BattleFeedTone = 'neutral' | 'red' | 'blue' | 'gold'

export interface BattleFeedItem {
  id: string
  text: string
  team?: TeamId
  tone: BattleFeedTone
}

export type ParticlePreset =
  | 'spark'
  | 'ember'
  | 'electric'
  | 'smoke'
  | 'fire'
  | 'ice'
  | 'gold'
  | 'heart'
  | 'petal'
  | 'cosmic'
  | 'explosion'
  | 'confetti'
