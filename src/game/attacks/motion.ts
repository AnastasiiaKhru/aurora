import { MAX_ATTACK_Y, MIN_ATTACK_Y, stageY } from '../../broadcast/stage.ts'
import type { TeamId } from '../../types/Team.ts'

export interface Pt {
  x: number
  y: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

export function cubic(a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt {
  const u = 1 - t
  const uu = u * u
  const tt = t * t
  return {
    x: a.x * uu * u + 3 * b.x * uu * t + 3 * c.x * u * tt + d.x * tt * t,
    y: a.y * uu * u + 3 * b.y * uu * t + 3 * c.y * u * tt + d.y * tt * t,
  }
}

export function perpendicular(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

export function playY(ny: number, height: number): number {
  const y = ny * height
  return clamp(y, stageY(MIN_ATTACK_Y, height), stageY(MAX_ATTACK_Y, height))
}

export function sideX(team: TeamId, x: number, width: number): number {
  const min = width * (team === 'red' ? 0.06 : 0.54)
  const max = width * (team === 'red' ? 0.46 : 0.94)
  return clamp(x, min, max)
}

export function muzzle(from: Pt, to: Pt, radius: number): Pt & { ang: number } {
  const ang = Math.atan2(to.y - from.y, to.x - from.x)
  return { x: from.x + Math.cos(ang) * radius, y: from.y + Math.sin(ang) * radius, ang }
}

export function spring(value: number, velocity: number, target: number, dt: number, stiffness = 260, damping = 16): { value: number; velocity: number } {
  const step = Math.min(0.033, Math.max(0, dt))
  let next = value
  let vel = velocity
  const slices = step > 0.02 ? 2 : 1
  const piece = step / slices
  for (let i = 0; i < slices; i += 1) {
    vel += (target - next) * stiffness * piece
    vel *= Math.exp(-damping * piece)
    next += vel * piece
  }
  return { value: next, velocity: vel }
}

export function smooth(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export function accel(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * x
}
