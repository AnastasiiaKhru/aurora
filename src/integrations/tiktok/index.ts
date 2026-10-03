import { director } from '../../systems/GameDirector.ts'
import type { TikTokAdapter } from './TikTokAdapter.ts'
import type { TikTokLiveEvent } from './TikTokEventTypes.ts'
import type {
  FollowReceivedEvent,
  GiftReceivedEvent,
  LikeReceivedEvent,
  ShareReceivedEvent,
  ViewerJoinedEvent,
  ViewerLeftEvent,
} from './TikTokEventTypes.ts'

export function handleTikTokGift(event: GiftReceivedEvent): void {
  director.handleGift(event)
}

export function handleTikTokJoin(event: ViewerJoinedEvent): void {
  director.handleJoin(event.userId, event.username, event.avatarUrl, event.team)
}

export function handleTikTokLeave(event: ViewerLeftEvent): void {
  director.handleLeave(event.userId, event.username)
}

export function handleTikTokLike(event: LikeReceivedEvent): void {
  director.handleLike(event.team, event.count)
}

export function handleTikTokFollow(event: FollowReceivedEvent): void {
  director.handleFollow(event.username, event.team)
}

export function handleTikTokShare(event: ShareReceivedEvent): void {
  director.handleShare(event.username, event.team)
}

export function dispatchTikTokEvent(event: TikTokLiveEvent): void {
  switch (event.type) {
    case 'viewerJoined':
      handleTikTokJoin(event.payload)
      break
    case 'viewerLeft':
      handleTikTokLeave(event.payload)
      break
    case 'likeReceived':
      handleTikTokLike(event.payload)
      break
    case 'followReceived':
      handleTikTokFollow(event.payload)
      break
    case 'shareReceived':
      handleTikTokShare(event.payload)
      break
    case 'giftReceived':
      handleTikTokGift(event.payload)
      break
    default:
      break
  }
}

export function attachTikTokAdapter(adapter: TikTokAdapter): () => void {
  adapter.start()
  return adapter.on(dispatchTikTokEvent)
}
