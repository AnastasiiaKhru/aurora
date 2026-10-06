import type { TeamId } from '../../types/Team.ts'

export interface ViewerJoinedEvent {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
  explicit?: boolean
  eventId?: string
}

export interface ViewerLeftEvent {
  userId: string
  username: string
  eventId?: string
}

export interface LikeReceivedEvent {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
  count: number
  eventId?: string
}

export interface FollowReceivedEvent {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
  eventId?: string
}

export interface ShareReceivedEvent {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
  eventId?: string
}

export interface CommentReceivedEvent {
  userId: string
  username: string
  avatarUrl: string
  text: string
  eventId?: string
}

export interface GiftReceivedEvent {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
  giftId: string
  giftName: string
  giftCount: number
  visualCount?: number
  coinValue?: number
  repeatEnd?: boolean
  preview?: boolean
  image?: string
  eventId?: string
}

export type TikTokLiveEvent =
  | { type: 'viewerJoined'; payload: ViewerJoinedEvent }
  | { type: 'viewerLeft'; payload: ViewerLeftEvent }
  | { type: 'likeReceived'; payload: LikeReceivedEvent }
  | { type: 'followReceived'; payload: FollowReceivedEvent }
  | { type: 'shareReceived'; payload: ShareReceivedEvent }
  | { type: 'commentReceived'; payload: CommentReceivedEvent }
  | { type: 'giftReceived'; payload: GiftReceivedEvent }
