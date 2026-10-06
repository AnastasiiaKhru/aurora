import type { AttackType } from '../../types/Gift.ts'
import { crystalShard, crown, inkOf, petal, roseHead, stroke } from './draw.ts'
import { lerp, lerpPt, perpendicular, smooth, type Pt } from './motion.ts'
import type { AttackCtx } from './play.ts'

const TAU = Math.PI * 2

/** Fast after a short windup. Ease-out, so the shot crosses the field instead of crawling. */
function release(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return 1 - (1 - x) * (1 - x)
}
const FREE = new Set(['Like', 'Comment', 'Follow', 'Share'])

export function isPaidGift(giftName: string, ambient?: boolean): boolean {
  return !ambient && !FREE.has(giftName)
}

/** Distinct filled attack for each paid gift type. Timing lands on the command's impact marks. */
export function drawSignature(ctx: AttackCtx): Pt | null {
  if (!isPaidGift(ctx.giftName ?? '', ctx.ambient)) return null
  const kind = ctx.attackType
  if (!kind) return null
  switch (kind) {
    case 'lightning':
    case 'thunderstorm':
      return drawLightning(ctx, kind === 'thunderstorm')
    case 'fireball':
    case 'fire_blast':
    case 'firestorm':
      return drawFire(ctx, kind)
    case 'meteor':
    case 'airstrike':
      return drawMeteor(ctx, kind === 'airstrike')
    case 'cosmic':
      return drawCosmic(ctx)
    case 'black_hole':
      return drawUniverse(ctx)
    case 'dragon':
      return drawRoyal(ctx)
    case 'beam':
    case 'laser':
    case 'sword':
      return drawBeam(ctx, kind)
    case 'tornado':
      return drawWhirl(ctx)
    case 'ice':
      return drawIce(ctx)
    case 'rose':
    case 'heart':
      return drawBloom(ctx, kind === 'heart')
    case 'magic':
      return drawMist(ctx)
    case 'rocket':
    case 'missile':
      return drawRocket(ctx, kind === 'missile')
    case 'sparkle_shot':
      if (ctx.motif === 'shard') return drawIce(ctx)
      return ctx.motif === 'confetti' ? drawConfetti(ctx) : drawSpark(ctx, true)
    case 'energy_bullet':
      return drawSpark(ctx, false)
    default:
      return null
  }
}

function hitsOf(ctx: AttackCtx): number[] {
  return ctx.hits && ctx.hits.length > 0 ? ctx.hits : [ctx.hitAt ?? 0.72]
}

function chargeRing(ctx: AttackCtx, open: number, color: number, radius: number): void {
  const spin = ctx.age * 7
  ctx.orb(ctx.from.x, ctx.from.y, radius * (0.7 + open), color, 0.28 * open)
  ctx.g.arc(ctx.from.x, ctx.from.y, radius * open, spin, spin + 1.8).stroke({ width: 3 * ctx.unit, color, alpha: 0.9 })
  ctx.g.arc(ctx.from.x, ctx.from.y, radius * 0.62 * open, -spin, -spin + 1.2).stroke({ width: 1.6 * ctx.unit, color: 0xffffff, alpha: 0.75 })
}

function boom(ctx: AttackCtx, k: number, color: number, hot: number, power: number): void {
  const u = ctx.unit * power
  ctx.orb(ctx.to.x, ctx.to.y, (18 + k * 70) * u, hot, (1 - k) * 0.55)
  ctx.g.circle(ctx.to.x, ctx.to.y, (8 + k * 18) * u).fill({ color: 0xffffff, alpha: (1 - k) * 0.85 })
  ctx.g.circle(ctx.to.x, ctx.to.y, (14 + k * 54) * u).stroke({ width: (4 - k * 3) * ctx.unit, color, alpha: 1 - k })
  ctx.g.circle(ctx.to.x, ctx.to.y, (8 + k * 28) * u).stroke({ width: 2 * ctx.unit, color: 0xffffff, alpha: (1 - k) * 0.8 })
  if (k < 0.12) {
    const bits = Math.round(6 + power * 4)
    for (let i = 0; i < bits; i += 1) {
      const a = (i / bits) * TAU + ctx.seed
      ctx.emit({
        x: ctx.to.x, y: ctx.to.y,
        vx: Math.cos(a) * (80 + power * 40), vy: Math.sin(a) * (50 + power * 20) - 20,
        life: 0.55, size: (3 + (i % 3)) * ctx.unit, rot: a, spin: 4, grav: 40,
        color: i % 2 ? color : 0xffffff, kind: 0,
      })
    }
  }
}

function drawLightning(ctx: AttackCtx, storm: boolean): Pt {
  const ink = inkOf(ctx.team)
  const marks = hitsOf(ctx)
  const first = marks[0] ?? 0.48
  if (ctx.t < Math.min(0.04, first * 0.16)) {
    const open = smooth(ctx.t / Math.min(0.04, first * 0.16))
    chargeRing(ctx, open, 0xd7ecff, (22 + (storm ? 12 : 0)) * ctx.unit)
    if ((ctx.age * 18) % 1 < 0.25) {
      const a = ctx.seed + ctx.age * 9
      const p = { x: ctx.from.x + Math.cos(a) * 16 * ctx.unit, y: ctx.from.y + Math.sin(a) * 12 * ctx.unit }
      stroke(ctx.g, [ctx.from.x, ctx.from.y, p.x, p.y], 2, 0xf4fbff, 0.9)
    }
    return ctx.from
  }
  let tip = ctx.from
  marks.forEach((at, index) => {
    if (ctx.t < at - 0.02) return
    const u = release(Math.min(1, (ctx.t - (at - 0.08)) / 0.1))
    const aim = { x: ctx.to.x + (index - (marks.length - 1) / 2) * 28 * ctx.unit, y: ctx.to.y + index * 10 * ctx.unit }
    const jag = boltPath(ctx.from, aim, u, ctx.seed + index, ctx.unit * (storm ? 18 : 12))
    stroke(ctx.glow, jag, (storm ? 46 : 32) * ctx.unit, 0x9ec6ff, 0.9)
    stroke(ctx.g, jag, (storm ? 14 : 9) * ctx.unit, 0xf7fbff, 1)
    tip = { x: jag[jag.length - 2] ?? aim.x, y: jag[jag.length - 1] ?? aim.y }
    if (u >= 1) {
      const k = smooth(Math.min(1, (ctx.t - at) / 0.22))
      ctx.orb(aim.x, aim.y, (12 + k * 36) * ctx.unit, ink.hot, (1 - k) * 0.45)
      ctx.g.circle(aim.x, aim.y, (6 + k * 22) * ctx.unit).stroke({ width: 2, color: 0xf4fbff, alpha: 1 - k })
    }
  })
  return tip
}

function boltPath(from: Pt, to: Pt, u: number, seed: number, jag: number): number[] {
  const pts = [from.x, from.y]
  const steps = 5
  for (let i = 1; i <= steps; i += 1) {
    const t = (i / steps) * u
    const p = lerpPt(from, to, t)
    const side = i === steps ? 0 : Math.sin(seed + i * 2.4) * jag
    const n = perpendicular(from, to)
    pts.push(p.x + n.x * side, p.y + n.y * side)
  }
  return pts
}

function drawFire(ctx: AttackCtx, kind: AttackType): Pt {
  const wide = kind !== 'fireball'
  const hit = hitsOf(ctx)[0] ?? 0.7
  const chargeEnd = 0.04
  if (ctx.t < chargeEnd) {
    const open = smooth(ctx.t / chargeEnd)
    chargeRing(ctx, open, 0xff7a3c, (16 + open * 10) * ctx.unit)
    ctx.orb(ctx.from.x, ctx.from.y, (10 + open * 14) * ctx.unit, 0xfff1c2, 0.45)
    return ctx.from
  }
  const u = release(Math.min(1, (ctx.t - chargeEnd) / Math.max(0.08, hit - chargeEnd)))
  const head = flightPoint(ctx, u, wide ? 18 : 28)
  if (u < 1) {
    ctx.streak(head.point.x, head.point.y, (wide ? 110 : 70) * ctx.unit, (wide ? 36 : 22) * ctx.unit, head.ang, 0xff6a22, 0.85)
    ctx.orb(head.point.x, head.point.y, (wide ? 48 : 32) * ctx.unit, 0xffb15a, 0.65)
    flameBody(ctx, head.point, head.ang, wide ? 34 : 22)
    if ((ctx.age * 12) % 1 < 0.3) {
      ctx.emit({
        x: head.point.x, y: head.point.y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30,
        life: 0.4, size: 3 * ctx.unit, rot: head.ang, spin: 2, grav: -30, color: 0xffc27a, kind: 0,
      })
    }
    return head.point
  }
  const k = smooth(Math.min(1, (ctx.t - hit) / 0.28))
  boom(ctx, k, 0xff6a22, 0xffe0a8, wide ? 1.35 : 1)
  if (kind === 'firestorm') {
    for (let i = 0; i < 3; i += 1) {
      const x = ctx.to.x + (i - 1) * 26 * ctx.unit
      ctx.g.circle(x, ctx.to.y + 8, (6 + k * 16) * ctx.unit).stroke({ width: 2, color: 0xffb15a, alpha: 1 - k })
    }
  }
  return ctx.to
}

function flameBody(ctx: AttackCtx, p: Pt, ang: number, size: number): void {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const tip = { x: p.x + c * size * ctx.unit, y: p.y + s * size * ctx.unit }
  const left = { x: p.x - c * size * 0.8 * ctx.unit - s * size * 0.45 * ctx.unit, y: p.y - s * size * 0.8 * ctx.unit + c * size * 0.45 * ctx.unit }
  const right = { x: p.x - c * size * 0.8 * ctx.unit + s * size * 0.45 * ctx.unit, y: p.y - s * size * 0.8 * ctx.unit - c * size * 0.45 * ctx.unit }
  ctx.g.poly([tip.x, tip.y, left.x, left.y, right.x, right.y]).fill({ color: 0xfff3c4, alpha: 0.95 })
  ctx.g.circle(p.x, p.y, size * 0.28 * ctx.unit).fill({ color: 0xffffff, alpha: 0.9 })
}

function drawMeteor(ctx: AttackCtx, raid: boolean): Pt {
  const hit = hitsOf(ctx)[0] ?? 0.7
  const open = smooth(Math.min(1, ctx.t / 0.18))
  ctx.g.circle(ctx.to.x, ctx.to.y, (16 + open * 28) * ctx.unit).stroke({ width: 3, color: 0xffe0b0, alpha: 0.45 + open * 0.45 })
  ctx.g.circle(ctx.to.x, ctx.to.y, 5 * ctx.unit).fill({ color: 0xfff6ea, alpha: 0.8 * open })
  if (ctx.t < 0.04) {
    chargeRing(ctx, open, 0xffb15a, 24 * ctx.unit)
    return ctx.from
  }
  const u = release(Math.min(1, (ctx.t - 0.04) / Math.max(0.08, hit - 0.04)))
  const drop = Math.min(ctx.to.y * 0.42, (raid ? 90 : 120) * ctx.unit)
  const sky = { x: lerp(ctx.from.x, ctx.to.x, 0.25), y: Math.max(40, ctx.to.y - drop) }
  const p = lerpPt(sky, ctx.to, u)
  const ang = Math.atan2(ctx.to.y - sky.y, ctx.to.x - sky.x)
  ctx.streak(p.x, p.y, (raid ? 140 : 200) * ctx.unit, 40 * ctx.unit, ang, 0xff6a22, 0.9)
  ctx.orb(p.x, p.y, 70 * ctx.unit, 0xfff1c2, 0.75)
  ctx.g.circle(p.x, p.y, 28 * ctx.unit).fill({ color: 0xfff6ea, alpha: 1 })
  ctx.g.circle(p.x, p.y, 12 * ctx.unit).fill({ color: 0xffffff, alpha: 1 })
  if (raid) {
    for (let i = 1; i <= 2; i += 1) {
      const q = lerpPt(sky, ctx.to, Math.max(0, u - i * 0.12))
      ctx.g.roundRect(q.x - 7, q.y - 3, 14, 6, 2).fill({ color: 0xf0c49a, alpha: 0.85 })
    }
  }
  if (u >= 1) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.3))
    boom(ctx, k, 0xff7a3c, 0xfff6ea, raid ? 1.35 : 2.1)
    ctx.g.ellipse(ctx.to.x, ctx.to.y + 6, (16 + k * 40) * ctx.unit, (6 + k * 10) * ctx.unit).stroke({ width: 3 * (1 - k), color: 0xffe0b0, alpha: 0.8 })
    return ctx.to
  }
  return p
}

function drawCosmic(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const hit = hitsOf(ctx)[0] ?? 0.42
  if (ctx.t < hit * 0.14) {
    const open = smooth(ctx.t / (hit * 0.14))
    for (let i = 0; i < 4; i += 1) {
      const a = ctx.age * 2.4 + (i / 4) * TAU
      const rad = (14 + open * 16) * ctx.unit
      ctx.g.circle(ctx.from.x + Math.cos(a) * rad, ctx.from.y + Math.sin(a) * rad * 0.6, 2.4 * ctx.unit).fill({ color: i % 2 ? ink.metal : 0xfff6ea, alpha: 0.9 })
    }
    ctx.orb(ctx.from.x, ctx.from.y, (12 + open * 18) * ctx.unit, 0xc7b6ff, 0.4)
    return ctx.from
  }
  const u = release(Math.min(1, (ctx.t - hit * 0.14) / Math.max(0.08, hit * 0.86)))
  const p = lerpPt(ctx.from, ctx.to, u)
  ctx.streak(p.x, p.y, 64 * ctx.unit, 10 * ctx.unit, Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x), 0xc7b6ff, 0.6)
  ctx.orb(p.x, p.y, 18 * ctx.unit, ink.hot, 0.4)
  ctx.g.circle(p.x, p.y, 8 * ctx.unit).fill({ color: 0xf4e8ff, alpha: 0.95 })
  ctx.g.circle(p.x, p.y, 3 * ctx.unit).fill({ color: 0xffffff, alpha: 1 })
  if (u >= 1) {
    boom(ctx, smooth(Math.min(1, (ctx.t - hit) / 0.28)), 0xc7b6ff, ink.hot, 1.4)
    return ctx.to
  }
  return p
}

function drawUniverse(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const hit = hitsOf(ctx)[0] ?? 0.74
  const cx = lerp(ctx.from.x, ctx.to.x, 0.5)
  const cy = Math.min(ctx.from.y, ctx.to.y) - 20 * ctx.unit
  const open = smooth(Math.min(1, ctx.t / 0.22))
  ctx.g.circle(cx, cy, 70 * ctx.unit * open).fill({ color: 0x07060e, alpha: 0.22 * open })
  if (ctx.t < 0.05) {
    for (let i = 0; i < 8; i += 1) {
      const a = ctx.seed + i
      ctx.g.circle(cx + Math.cos(a) * 40 * ctx.unit, cy + Math.sin(a * 1.7) * 18 * ctx.unit, 1.6).fill({ color: 0xfff6ea, alpha: open })
    }
    chargeRing(ctx, open, ink.hot, 22 * ctx.unit)
    return ctx.from
  }
  const grow = smooth(Math.min(1, (ctx.t - 0.05) / 0.12))
  ctx.g.circle(ctx.from.x, ctx.from.y, (6 + grow * 18) * ctx.unit).fill({ color: 0x120814, alpha: 0.85 })
  ctx.g.circle(ctx.from.x, ctx.from.y, (8 + grow * 22) * ctx.unit).stroke({ width: 2, color: ink.hot, alpha: 0.8 })
  if (ctx.t < hit * 0.22) return ctx.from
  const u = release(Math.min(1, (ctx.t - hit * 0.22) / Math.max(0.08, hit * 0.78)))
  const p = lerpPt(ctx.from, ctx.to, u)
  ctx.streak(p.x, p.y, 90 * ctx.unit, 14 * ctx.unit, Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x), ink.hot, 0.55)
  ctx.orb(p.x, p.y, (16 + grow * 10) * ctx.unit, 0xc7b6ff, 0.45)
  if (u >= 1) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.26))
    for (let i = 0; i < 3; i += 1) {
      ctx.g.circle(ctx.to.x, ctx.to.y, (12 + i * 16 + k * 48) * ctx.unit).stroke({ width: 3 - i, color: i === 1 ? 0xffffff : ink.hot, alpha: (1 - k) * (1 - i * 0.2) })
    }
    boom(ctx, k, 0xc7b6ff, 0xfff6ea, 1.8)
    return ctx.to
  }
  return p
}

function drawRoyal(ctx: AttackCtx): Pt {
  const gold = 0xf0c56a
  const hit = hitsOf(ctx)[0] ?? 0.58
  if (ctx.t < hit * 0.12) {
    const open = smooth(ctx.t / (hit * 0.12))
    crown(ctx.g, ctx.from.x, ctx.from.y - (16 + open * 12) * ctx.unit, (8 + open * 6) * ctx.unit, gold, 0.95)
    chargeRing(ctx, open, gold, 22 * ctx.unit)
    return ctx.from
  }
  const u = release(Math.min(1, (ctx.t - hit * 0.12) / Math.max(0.08, hit * 0.88)))
  const n = perpendicular(ctx.from, ctx.to)
  let last = ctx.from
  for (let i = 0; i < 3; i += 1) {
    const lag = Math.max(0, u - i * 0.08)
    const origin = { x: ctx.from.x + n.x * (i - 1) * 18 * ctx.unit, y: ctx.from.y + n.y * (i - 1) * 18 * ctx.unit }
    const p = lerpPt(origin, ctx.to, lag)
    const ang = Math.atan2(ctx.to.y - origin.y, ctx.to.x - origin.x)
    ctx.streak(p.x, p.y, 36 * ctx.unit, 6 * ctx.unit, ang, gold, 0.7)
    ctx.g.roundRect(p.x - 8 * ctx.unit, p.y - 2 * ctx.unit, 16 * ctx.unit, 4 * ctx.unit, 2).fill({ color: 0xfff6ea, alpha: 0.95 })
    last = p
  }
  if (u >= 1) {
    boom(ctx, smooth(Math.min(1, (ctx.t - hit) / 0.24)), gold, 0xfff6ea, 1.55)
    crown(ctx.g, ctx.to.x, ctx.to.y - 10 * ctx.unit, 12 * ctx.unit, gold, 1 - smooth((ctx.t - hit) / 0.3))
    return ctx.to
  }
  return last
}

function drawBeam(ctx: AttackCtx, kind: AttackType): Pt {
  const ink = inkOf(ctx.team)
  const hit = hitsOf(ctx)[0] ?? 0.34
  const hue = kind === 'sword' ? 0xf0c56a : kind === 'laser' ? 0xb9dcff : ink.hot
  if (ctx.t < hit * 0.12) {
    const open = smooth(ctx.t / Math.max(0.04, hit * 0.12))
    for (let i = 1; i <= 3; i += 1) {
      ctx.g.circle(ctx.from.x, ctx.from.y, (6 + i * 6) * ctx.unit * open).stroke({ width: 1.5, color: hue, alpha: 0.35 + open * 0.4 })
    }
    ctx.orb(ctx.from.x, ctx.from.y, 8 * ctx.unit * open, 0xffffff, 0.7)
    return ctx.from
  }
  const u = release(Math.min(1, (ctx.t - hit * 0.12) / Math.max(0.05, hit * 0.88)))
  const p = lerpPt(ctx.from, ctx.to, u)
  const ang = Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x)
  ctx.streak(p.x, p.y, 110 * ctx.unit * u, kind === 'laser' ? 14 * ctx.unit : 8 * ctx.unit, ang, hue, 0.55)
  ctx.streak(p.x, p.y, 80 * ctx.unit * u, 2.4 * ctx.unit, ang, 0xffffff, 0.95)
  if (kind === 'sword') {
    const n = perpendicular(ctx.from, ctx.to)
    const slash = (ctx.t - hit * 0.12) * 8
    ctx.g.arc(p.x, p.y, 22 * ctx.unit, ang - 0.8 + slash, ang + 0.5 + slash).stroke({ width: 4 * ctx.unit, color: 0xfff6ea, alpha: 0.9 })
    ctx.g.circle(p.x + n.x * 8, p.y + n.y * 8, 3).fill({ color: 0xf0c56a, alpha: 0.9 })
  }
  if (u >= 1) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.22))
    boom(ctx, k, hue, 0xffffff, kind === 'laser' ? 1.45 : 1.15)
    return ctx.to
  }
  return p
}

function drawWhirl(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const travel = smooth(Math.min(1, Math.max(0, (ctx.t - 0.03) / 0.71)))
  const n = perpendicular(ctx.from, ctx.to)
  const wander = Math.sin(ctx.age * 4 + ctx.seed) * 22 * ctx.unit * (1 - travel)
  const base = lerpPt(ctx.from, ctx.to, travel)
  const p = { x: base.x + n.x * wander, y: base.y + n.y * wander * 0.35 }
  const h = 52 * ctx.unit
  for (let i = 0; i < 6; i += 1) {
    const t = i / 6
    const y = p.y - h * t
    const rx = (8 + t * 18) * ctx.unit
    ctx.g.ellipse(p.x + Math.sin(ctx.age * 5 + i) * 3, y, rx, rx * 0.42).fill({ color: i % 2 ? ink.hot : ink.core, alpha: 0.18 })
    ctx.g.ellipse(p.x, y, rx, rx * 0.42).stroke({ width: 2.4, color: i % 2 ? ink.hot : 0xffffff, alpha: 0.75 })
  }
  if (ctx.t > 0.78) boom(ctx, smooth((ctx.t - 0.78) / 0.22), ink.hot, ink.core, 1.2)
  return p
}

function drawIce(ctx: AttackCtx): Pt {
  const hue = ctx.team === 'red' ? 0xd7f4ff : 0xb9dcff
  const hit = ctx.hitAt ?? 0.66
  if (ctx.t < hit * 0.12) {
    const open = smooth(ctx.t / (hit * 0.12))
    for (let i = 0; i < 5; i += 1) crystalShard(ctx.g, ctx.from.x, ctx.from.y, (8 + open * 16) * ctx.unit, -Math.PI / 2 + (i - 2) * 0.4, hue, 0.9)
    return ctx.from
  }
  const u = release(Math.min(1, (ctx.t - hit * 0.12) / (hit * 0.88)))
  const p = lerpPt(ctx.from, ctx.to, u)
  const ang = Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x)
  crystalShard(ctx.g, p.x, p.y, 18 * ctx.unit, ang, 0xffffff, 0.95)
  ctx.streak(p.x, p.y, 40 * ctx.unit, 6, ang, hue, 0.45)
  if (u >= 1) {
    const k = smooth((ctx.t - hit) / 0.25)
    for (let i = 0; i < 4; i += 1) crystalShard(ctx.g, ctx.to.x + (i - 1.5) * 14 * ctx.unit, ctx.to.y, Math.max(4, (18 - k * 16) * ctx.unit), -Math.PI / 2, hue, 1 - k)
    ctx.g.circle(ctx.to.x, ctx.to.y, (8 + k * 30) * ctx.unit).stroke({ width: 2, color: 0xffffff, alpha: 1 - k })
    return ctx.to
  }
  return p
}

function drawBloom(ctx: AttackCtx, heart: boolean): Pt {
  const ink = inkOf(ctx.team)
  const hit = ctx.hitAt ?? 0.74
  if (ctx.t < hit * 0.12) {
    const open = smooth(ctx.t / (hit * 0.12))
    chargeRing(ctx, open, heart ? 0xff8aa8 : ink.hot, 16 * ctx.unit)
    if (heart) {
      ctx.g.circle(ctx.from.x - 5, ctx.from.y - 2, 6 * open).fill({ color: ink.hot, alpha: 0.95 })
      ctx.g.circle(ctx.from.x + 5, ctx.from.y - 2, 6 * open).fill({ color: ink.hot, alpha: 0.95 })
    } else roseHead(ctx.g, ctx.from.x, ctx.from.y, (8 + open * 8) * ctx.unit, ctx.age, open, ctx.team)
    return ctx.from
  }
  const head = flightPoint(ctx, release(Math.min(1, (ctx.t - hit * 0.12) / (hit * 0.88))), 26)
  if (head.u < 1) {
    ctx.streak(head.point.x, head.point.y, 28 * ctx.unit, 6 * ctx.unit, head.ang, heart ? 0xff8aa8 : ink.hot, 0.45)
    if (heart) ctx.g.circle(head.point.x, head.point.y, 7 * ctx.unit).fill({ color: ink.hot, alpha: 0.95 })
    else roseHead(ctx.g, head.point.x, head.point.y, 10 * ctx.unit, head.ang, 1, ctx.team)
    if ((ctx.age * 8) % 1 < 0.2) {
      ctx.emit({
        x: head.point.x, y: head.point.y, vx: (Math.random() - 0.5) * 20, vy: -16,
        life: 0.6, size: 4 * ctx.unit, rot: head.ang, spin: 3, grav: 40, color: ink.hot, kind: 3,
      })
    }
    return head.point
  }
  const k = smooth((ctx.t - hit) / 0.26)
  boom(ctx, k, heart ? 0xff8aa8 : ink.hot, 0xfff6ea, heart ? 1.05 : 0.9)
  for (let i = 0; i < 5; i += 1) petal(ctx.g, ctx.to.x, ctx.to.y, ctx.seed + i, (10 + k * 18) * ctx.unit, ink.hot, 1 - k)
  return ctx.to
}

function drawMist(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const hit = ctx.hitAt ?? 0.74
  const u = smooth(Math.min(1, Math.max(0, (ctx.t - 0.04) / Math.max(0.12, hit - 0.04))))
  const p = u <= 0 ? ctx.from : flightPoint(ctx, u, 20).point
  ctx.orb(p.x, p.y, (18 + u * 8) * ctx.unit, ink.metal, 0.35)
  ctx.g.circle(p.x, p.y, 8 * ctx.unit).fill({ color: 0xfff6ea, alpha: 0.55 })
  if (u >= 1) {
    boom(ctx, smooth((ctx.t - hit) / 0.24), ink.metal, ink.hot, 1)
    return ctx.to
  }
  return p
}

function drawRocket(ctx: AttackCtx, missile: boolean): Pt {
  const hit = ctx.hitAt ?? 0.8
  if (ctx.t < 0.04) {
    chargeRing(ctx, smooth(ctx.t / 0.04), 0xf0c56a, 14 * ctx.unit)
    return ctx.from
  }
  const u = release(Math.min(1, (ctx.t - 0.04) / Math.max(0.08, hit - 0.04)))
  const head = flightPoint(ctx, u, missile ? 10 : 22)
  if (u < 1) {
    const c = Math.cos(head.ang)
    const s = Math.sin(head.ang)
    ctx.streak(head.point.x, head.point.y, 48 * ctx.unit, 8 * ctx.unit, head.ang, 0xff7a3c, 0.7)
    ctx.g.roundRect(head.point.x - 7, head.point.y - 3, 16 * ctx.unit, 6 * ctx.unit, 3).fill({ color: missile ? 0xd5e0f0 : 0xf4f7fb, alpha: 0.95 })
    ctx.g.poly([
      head.point.x + c * 12, head.point.y + s * 12,
      head.point.x - s * 5, head.point.y + c * 5,
      head.point.x + s * 5, head.point.y - c * 5,
    ]).fill({ color: 0xff6a22, alpha: 0.95 })
    return head.point
  }
  boom(ctx, smooth((ctx.t - hit) / 0.22), 0xff7a3c, 0xfff6ea, missile ? 1.25 : 1.05)
  return ctx.to
}

function drawSpark(ctx: AttackCtx, paid: boolean): Pt {
  const ink = inkOf(ctx.team)
  const hit = ctx.hitAt ?? 0.7
  if (paid && ctx.t < 0.04) {
    chargeRing(ctx, smooth(ctx.t / 0.04), ink.hot, 14 * ctx.unit)
    return ctx.from
  }
  const start = paid ? 0.04 : 0.02
  const u = release(Math.min(1, Math.max(0, (ctx.t - start) / Math.max(0.12, hit - start))))
  const head = flightPoint(ctx, u, paid ? 16 : 8)
  if (u < 1) {
    ctx.streak(head.point.x, head.point.y, (paid ? 36 : 18) * ctx.unit, (paid ? 7 : 3) * ctx.unit, head.ang, ink.hot, paid ? 0.7 : 0.45)
    ctx.g.circle(head.point.x, head.point.y, (paid ? 5 : 2.4) * ctx.unit).fill({ color: 0xffffff, alpha: 0.95 })
    if (paid && ctx.motif === 'stamp') ctx.g.roundRect(head.point.x - 6, head.point.y - 4, 12, 8, 2).stroke({ width: 1.5, color: ink.core, alpha: 0.9 })
    return head.point
  }
  if (paid) boom(ctx, smooth((ctx.t - hit) / 0.2), ink.hot, 0xffffff, 0.75)
  else ctx.g.circle(ctx.to.x, ctx.to.y, (4 + smooth((ctx.t - hit) / 0.2) * 10) * ctx.unit).stroke({ width: 1.4, color: ink.hot, alpha: 0.8 })
  return ctx.to
}

function drawConfetti(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const n = perpendicular(ctx.from, ctx.to)
  const colors = [ink.hot, 0xf0c56a, 0xffffff, ink.metal]
  let last = ctx.from
  for (let i = 0; i < 4; i += 1) {
    const start = 0.03 + i * 0.04
    const hit = 0.55 + i * 0.08
    if (ctx.t < start) continue
    const u = smooth(Math.min(1, (ctx.t - start) / (hit - start)))
    const origin = { x: ctx.from.x + n.x * (i - 1.5) * 14 * ctx.unit, y: ctx.from.y }
    const aim = { x: ctx.to.x + (i - 1.5) * 16 * ctx.unit, y: ctx.to.y }
    const p = lerpPt(origin, aim, u)
    ctx.g.rect(p.x, p.y, 5 * ctx.unit, 3 * ctx.unit).fill({ color: colors[i % colors.length], alpha: 0.95 })
    last = p
    if (u >= 1) ctx.g.circle(aim.x, aim.y, (6 + smooth((ctx.t - hit) / 0.15) * 14) * ctx.unit).stroke({ width: 1.5, color: colors[i % colors.length]!, alpha: 0.7 })
  }
  return last
}

function flightPoint(ctx: AttackCtx, u: number, bend: number): { point: Pt; u: number; ang: number } {
  const n = perpendicular(ctx.from, ctx.to)
  const side = Math.sin(ctx.seed) >= 0 ? 1 : -1
  const c1 = lerpPt(ctx.from, ctx.to, 0.35)
  const c2 = lerpPt(ctx.from, ctx.to, 0.7)
  c1.x += n.x * bend * ctx.unit * side
  c1.y += n.y * bend * ctx.unit * side
  const point = lerpPt(lerpPt(ctx.from, c1, u), lerpPt(c2, ctx.to, u), u)
  const ahead = lerpPt(ctx.from, ctx.to, Math.min(1, u + 0.05))
  return { point, u, ang: Math.atan2(ahead.y - point.y, ahead.x - point.x) }
}
