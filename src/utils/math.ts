export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function easeOutCubic(t: number): number {
  const x = clamp(t, 0, 1)
  return 1 - (1 - x) ** 3
}

export function easeInCubic(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * x
}

export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function comboIntensity(count: number): number {
  if (count >= 100) return 3
  if (count >= 50) return 2.35
  if (count >= 25) return 1.9
  if (count >= 10) return 1.55
  if (count >= 5) return 1.28
  if (count >= 3) return 1.14
  if (count >= 2) return 1.06
  return 1
}

export function comboScoreFactor(count: number): number {
  if (count >= 100) return 1.55
  if (count >= 50) return 1.32
  if (count >= 25) return 1.18
  if (count >= 10) return 1.08
  return 1
}
