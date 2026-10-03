import type { TeamId } from '../../types/Team.ts'

export interface ViewerJoinedEvent {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
}

export interface ViewerLeftEvent {
  userId: string
  username: string
}

export interface LikeReceivedEvent {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
  count: number
}

export interface FollowReceivedEvent {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
}

export interface ShareReceivedEvent {
  userId: string
  username: string
  avatarUrl: string
  team: TeamId
}

export interface GiftReceivedEvent {
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

export type TikTokLiveEvent =
  | { type: 'viewerJoined'; payload: ViewerJoinedEvent }
  | { type: 'viewerLeft'; payload: ViewerLeftEvent }
  | { type: 'likeReceived'; payload: LikeReceivedEvent }
  | { type: 'followReceived'; payload: FollowReceivedEvent }
  | { type: 'shareReceived'; payload: ShareReceivedEvent }
  | { type: 'giftReceived'; payload: GiftReceivedEvent }
