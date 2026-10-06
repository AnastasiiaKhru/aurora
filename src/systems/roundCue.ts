/** Between-round cue. NEW BATTLE, then 3, 2, 1, then FIGHT. Null means combat may start. */
export const NEW_BATTLE_MS = 800
export const COUNT_BEAT_MS = 1_000
export const FIGHT_BEAT_MS = 720

export function nextRoundCue(elapsed: number): { label: string; level: number } | null {
  if (!Number.isFinite(elapsed) || elapsed < NEW_BATTLE_MS) return { label: 'NEXT', level: 1 }
  const beat = elapsed - NEW_BATTLE_MS
  if (beat < COUNT_BEAT_MS) return { label: '3', level: 2 }
  if (beat < COUNT_BEAT_MS * 2) return { label: '2', level: 3 }
  if (beat < COUNT_BEAT_MS * 3) return { label: '1', level: 4 }
  if (beat < COUNT_BEAT_MS * 3 + FIGHT_BEAT_MS) return { label: 'FIGHT', level: 6 }
  return null
}

export const NEXT_ROUND_MS = NEW_BATTLE_MS + COUNT_BEAT_MS * 3 + FIGHT_BEAT_MS
