import type { TikTokLiveEvent } from './TikTokEventTypes.ts'

export interface TikTokAdapter {
  start(): void
  stop(): void
  on(listener: (event: TikTokLiveEvent) => void): () => void
}
