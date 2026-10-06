export type TeamId = 'red' | 'blue'

export interface ViewerPayload {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
}

export interface GiftPayload extends ViewerPayload {
  giftId: string
  giftName: string
  giftCount: number
  visualCount?: number
  coinValue?: number
  repeatEnd?: boolean
  preview?: boolean
  image?: string
}

export interface LikePayload extends ViewerPayload {
  count: number
}

export interface ChatPayload {
  userId: string
  username: string
  avatarUrl: string
  text: string
}

export interface ConnectionStatusMessage {
  type: 'connection_status'
  connected: boolean
  username: string
  roomId: string
  detail: string
}

export interface WireChat {
  type: 'chat'
  userId: string
  username: string
  comment: string
  avatarUrl: string
  eventId: string
}

export interface WireLike {
  type: 'like'
  userId: string
  username: string
  count: number
  avatarUrl: string
  team?: TeamId
  eventId: string
}

export interface WireGift {
  type: 'gift'
  userId: string
  username: string
  giftName: string
  giftId: number | string
  diamonds: number
  repeatCount: number
  repeatEnd: boolean
  avatarUrl: string
  team?: TeamId
  preview?: boolean
  visualCount?: number
  image?: string
  eventId: string
}

export interface WireSocial {
  type: 'follow' | 'share' | 'join'
  userId: string
  username: string
  avatarUrl: string
  team?: TeamId
  explicit?: boolean
  eventId: string
}

export type LiveWireEvent = WireChat | WireLike | WireGift | WireSocial

export type BridgeMessage = ConnectionStatusMessage | LiveWireEvent

export interface CatalogGift {
  id: string
  name: string
  diamondCount?: number
  imageUrl?: string
  giftType?: number
}
