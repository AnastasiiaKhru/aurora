import { battleConfig } from '../config/battleConfig.ts'
import type { GiftEvent } from '../types/Events.ts'

interface PendingGift {
  event: GiftEvent
  count: number
  started: number
  readyAt: number
}

export class GiftSystem {
  private pending = new Map<string, PendingGift>()

  push(event: GiftEvent): void {
    const key = `${event.userId}|${event.giftId}|${event.team}`
    const now = performance.now()
    const existing = this.pending.get(key)
    if (!existing) {
      this.pending.set(key, {
        event,
        count: Math.max(1, event.giftCount),
        started: now,
        readyAt: now + battleConfig.giftAggregateMs,
      })
      return
    }
    existing.count += Math.max(1, event.giftCount)
    existing.event = { ...event, giftCount: existing.count }
    if (now - existing.started > 120) existing.readyAt = now
  }

  flush(now: number): { event: GiftEvent; count: number }[] {
    const ready: { event: GiftEvent; count: number }[] = []
    for (const [key, item] of this.pending) {
      if (now < item.readyAt) continue
      ready.push({ event: { ...item.event, giftCount: item.count }, count: item.count })
      this.pending.delete(key)
    }
    return ready
  }

  clear(): void {
    this.pending.clear()
  }
}
