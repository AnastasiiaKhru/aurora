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

export type BridgeMessage =
  | ConnectionStatusMessage
  | { type: 'viewerJoined'; payload: ViewerPayload }
  | { type: 'giftReceived'; payload: GiftPayload }
  | { type: 'likeReceived'; payload: LikePayload }
  | { type: 'followReceived'; payload: ViewerPayload }
  | { type: 'shareReceived'; payload: ViewerPayload }
  | { type: 'chatReceived'; payload: ChatPayload }

export interface CatalogGift {
  id: string
  name: string
  diamondCount?: number
  imageUrl?: string
  giftType?: number
}
