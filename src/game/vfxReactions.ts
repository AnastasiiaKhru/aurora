import { director } from '../systems/GameDirector.ts'
import type { TeamId } from '../types/Team.ts'

interface Kick {
  x: number
  y: number
  leanX: number
  leanY: number
  glow: number
  color: number
}

const idle: Kick = { x: 0, y: 0, leanX: 0, leanY: 0, glow: 0, color: 0xfff6ea }
const kicks = new Map<string, Kick>()

function slot(id: string): Kick {
  let kick = kicks.get(id)
  if (!kick) {
    kick = { x: 0, y: 0, leanX: 0, leanY: 0, glow: 0, color: 0xfff6ea }
    kicks.set(id, kick)
  }
  return kick
}

export function readReaction(id: string): Kick {
  return kicks.get(id) ?? idle
}

export function tickReactions(dt: number): void {
  const fade = Math.exp(-dt * 16)
  for (const [id, kick] of kicks) {
    kick.x *= fade
    kick.y *= fade
    kick.leanX *= Math.exp(-dt * 8)
    kick.leanY *= Math.exp(-dt * 8)
    kick.glow = Math.max(0, kick.glow - dt * 2.8)
    if (Math.abs(kick.x) < 0.15 && Math.abs(kick.y) < 0.15 && Math.abs(kick.leanX) < 0.15 && kick.glow < 0.03) {
      kicks.delete(id)
    }
  }
}

export function clearReactions(): void {
  kicks.clear()
}

export function impactReaction(team: TeamId, x: number, y: number, pixels: number, color: number): void {
  const reach = pixels > 8 ? 0.22 : 0.14
  for (const body of director.players.bodies.values()) {
    if (body.team !== team || body.dying > 0) continue
    const dx = body.x - x
    const dy = body.y - y
    const dist = Math.hypot(dx, dy)
    if (dist > reach) continue
    const falloff = 1 - dist / reach
    const len = dist || 1
    const mag = Math.min(16, pixels * falloff)
    const kick = slot(body.id)
    kick.x += (dx / len) * mag
    kick.y += (dy / len) * mag
    kick.glow = Math.max(kick.glow, pixels > 4 ? falloff * 0.95 : falloff * 0.4)
    kick.color = color
  }
}

export function pullToward(team: TeamId, x: number, y: number, pixels: number, color: number): void {
  for (const body of director.players.bodies.values()) {
    if (body.team !== team || body.dying > 0) continue
    const dx = x - body.x
    const dy = y - body.y
    const dist = Math.hypot(dx, dy)
    if (dist > 0.26 || dist < 0.001) continue
    const mag = Math.min(10, pixels * (1 - dist / 0.26))
    const kick = slot(body.id)
    kick.leanX = (dx / dist) * mag
    kick.leanY = (dy / dist) * mag
    kick.glow = Math.max(kick.glow, 0.28)
    kick.color = color
  }
}

export function glowSender(team: TeamId, x: number, y: number, color: number, amount: number): void {
  let best: string | null = null
  let bestDist = 0.08
  for (const body of director.players.bodies.values()) {
    if (body.team !== team || body.dying > 0) continue
    const dist = Math.hypot(body.x - x, body.y - y)
    if (dist < bestDist) {
      bestDist = dist
      best = body.id
    }
  }
  if (!best) return
  const kick = slot(best)
  kick.glow = Math.max(kick.glow, amount)
  kick.color = color
}
