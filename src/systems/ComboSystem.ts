import { battleConfig } from '../config/battleConfig.ts'

interface ComboTrack {
  count: number
  lastAt: number
  announced: number
}

export class ComboSystem {
  private tracks = new Map<string, ComboTrack>()

  register(userId: string, giftId: string, count: number, eligible: boolean, now: number): {
    total: number
    milestone: number | null
  } {
    if (!eligible) {
      return { total: count, milestone: count >= 2 ? count : null }
    }
    const key = `${userId}|${giftId}`
    let track = this.tracks.get(key)
    if (!track || now - track.lastAt > battleConfig.comboWindowMs) {
      track = { count: 0, lastAt: now, announced: 0 }
      this.tracks.set(key, track)
    }
    track.count += count
    track.lastAt = now
    const milestone = nextMilestone(track.announced, track.count)
    if (milestone) track.announced = milestone
    return { total: track.count, milestone }
  }

  decay(now: number): void {
    for (const [key, track] of this.tracks) {
      if (now - track.lastAt > battleConfig.comboWindowMs) this.tracks.delete(key)
    }
  }

  reset(): void {
    this.tracks.clear()
  }
}

function nextMilestone(previous: number, total: number): number | null {
  let found: number | null = null
  for (const milestone of battleConfig.comboMilestones) {
    if (total >= milestone && milestone > previous) found = milestone
  }
  return found
}

export function comboMark(count: number): string {
  if (count >= 100) return '👑'
  if (count >= 50) return '💥'
  if (count >= 25) return '⚡'
  if (count >= 10) return '🔥'
  return '×'
}
