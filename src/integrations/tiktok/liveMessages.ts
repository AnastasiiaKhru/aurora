import type { TeamId } from '../../types/Team.ts'

export interface LiveViewerPayload {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
  eventId?: string
}

export interface LiveGiftPayload extends LiveViewerPayload {
  giftId: string
  giftName: string
  giftCount: number
  visualCount?: number
  coinValue?: number
  repeatEnd?: boolean
  preview?: boolean
  image?: string
}

export interface LiveLikePayload extends LiveViewerPayload {
  count: number
}

export interface LiveChatPayload {
  userId: string
  username: string
  avatarUrl: string
  text: string
  eventId?: string
}

export interface LiveConnectionStatus {
  type: 'connection_status'
  connected: boolean
  username: string
  roomId: string
  detail?: string
}

export type LiveLinkPhase = 'connecting' | 'live' | 'offline'

export interface LiveLinkStatus {
  phase: LiveLinkPhase
  username: string
  roomId: string
  detail: string
}
