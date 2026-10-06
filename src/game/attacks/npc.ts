import type { Graphics } from 'pixi.js'
import type { TeamId } from '../../types/Team.ts'
import type { NpcKind } from '../../systems/attractMode.ts'
import { crystalShard, maple, star } from './draw.ts'
import type { Pt } from './motion.ts'

export function drawNpcAttack(input: {
  g: Graphics
  glow: Graphics
  from: Pt
  to: Pt
  team: TeamId
  t: number
  age: number
  unit: number
  kind: NpcKind
}): void {
  const travel = smooth(Math.min(1, input.t / 0.82))
  const lift = 92 * input.unit
  const mid = { x: (input.from.x + input.to.x) / 2, y: Math.min(input.from.y, input.to.y) - lift }
  const at = quad(input.from, mid, input.to, travel)
  const spin = input.age * (input.kind === 'maple' ? 7 : 5)
  if (input.t < 0.46) drawCharge(input, spin)
  if (travel > 0.08 && travel < 1) drawFlight(input, at, spin, travel)
  if (input.t > 0.78) drawRipple(input, input.t)
}

function drawCharge(input: { g: Graphics; glow: Graphics; from: Pt; age: number; unit: number; kind: NpcKind }, spin: number): void {
  const gold = input.kind === 'maple'
  const color = gold ? 0xffd56a : 0xd7e8ff
  const accent = gold ? 0xff4b4b : 0x7eb6ff
  input.glow.circle(input.from.x, input.from.y, 18 * input.unit).fill({ color, alpha: 0.18 })
  if (gold) {
    crystalShard(input.g, input.from.x + Math.cos(spin) * 22 * input.unit, input.from.y + Math.sin(spin) * 16 * input.unit, 11 * input.unit, spin, 0xffe7a8, 0.95)
    maple(input.g, input.from.x, input.from.y - 8 * input.unit, 8 * input.unit, accent, 0.35, spin * 0.2)
    return
  }
  for (let i = 0; i < 3; i += 1) {
    const angle = spin + i * ((Math.PI * 2) / 3)
    star(
      input.g,
      input.from.x + Math.cos(angle) * 24 * input.unit,
      input.from.y + Math.sin(angle) * 16 * input.unit,
      7 * input.unit,
      i === 0 ? 0xffffff : color,
      0.95,
      angle,
    )
  }
}

function drawFlight(input: { g: Graphics; glow: Graphics; unit: number; kind: NpcKind }, at: Pt, spin: number, travel: number): void {
  const grown = travel > 0.42
  if (input.kind === 'maple') {
    if (!grown) crystalShard(input.g, at.x, at.y, 12 * input.unit, spin, 0xffe7a8, 0.95)
    else maple(input.g, at.x, at.y, 16 * input.unit, 0xff5a5a, 0.95, spin)
    maple(input.glow, at.x, at.y, 22 * input.unit, 0xffd56a, 0.28, spin)
    return
  }
  star(input.g, at.x, at.y, (grown ? 15 : 9) * input.unit, 0xf4f8ff, 0.96, spin)
  star(input.glow, at.x, at.y, 20 * input.unit, 0x8eb6ff, 0.3, spin * 0.5)
}

function drawRipple(input: { g: Graphics; glow: Graphics; to: Pt; unit: number; kind: NpcKind }, t: number): void {
  const age = Math.min(1, (t - 0.78) / 0.22)
  const gold = input.kind === 'maple'
  const inner = gold ? 0xffd56a : 0xf4f8ff
  const outer = gold ? 0xff4b4b : 0x7aa6ff
  for (let ring = 0; ring < 3; ring += 1) {
    const radius = (16 + ring * 14 + age * 28) * input.unit
    input.g.circle(input.to.x, input.to.y, radius).stroke({ width: 2.4, color: ring === 1 ? inner : outer, alpha: 0.75 * (1 - age) })
  }
  if (gold) maple(input.g, input.to.x, input.to.y, 18 * input.unit, inner, 0.8 * (1 - age * 0.4), age * 2)
  else star(input.g, input.to.x, input.to.y, 16 * input.unit, inner, 0.85, age)
}

function quad(a: Pt, b: Pt, c: Pt, t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}
