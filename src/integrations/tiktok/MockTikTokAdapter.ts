import type { TikTokAdapter } from './TikTokAdapter.ts'
import type { TikTokLiveEvent } from './TikTokEventTypes.ts'

export class MockTikTokAdapter implements TikTokAdapter {
  private listeners = new Set<(event: TikTokLiveEvent) => void>()
  private running = false

  start(): void {
    this.running = true
  }

  stop(): void {
    this.running = false
  }

  on(listener: (event: TikTokLiveEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: TikTokLiveEvent): void {
    if (!this.running) return
    for (const listener of this.listeners) listener(event)
  }
}

export const mockTikTok = new MockTikTokAdapter()
