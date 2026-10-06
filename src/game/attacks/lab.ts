import type { AttackStyle } from './style.ts'

export type AttackQuality = 'auto' | 'low' | 'full'

export const attackLab = {
  speed: 1,
  density: 1,
  shake: 1,
  volume: 0.8,
  quality: 'auto' as AttackQuality,
  volumes: {
    pulse: 1,
    comet: 1,
    portal: 1,
    rose: 1,
    maple: 1,
    star: 1,
    vortex: 1,
    planet: 1,
    crystal: 1,
    eclipse: 1,
  } satisfies Record<AttackStyle, number>,
}

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const weakDevice =
  (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4) ||
  (typeof navigator !== 'undefined' && ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4)

export function lowQuality(): boolean {
  if (attackLab.quality === 'low') return true
  if (attackLab.quality === 'full') return false
  return reduced || weakDevice
}

export function effectDensity(): number {
  const base = Math.max(0.15, Math.min(1.6, attackLab.density))
  return lowQuality() ? base * 0.42 : base
}

export function motionScale(): number {
  return lowQuality() ? 0.65 : 1
}
