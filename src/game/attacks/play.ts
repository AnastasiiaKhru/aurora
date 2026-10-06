import type { Graphics } from 'pixi.js'
import type { TeamId } from '../../types/Team.ts'
import { crystalShard, crown, inkOf, maple, petal, planetBody, portalRing, roseHead, silhouette, star, stem, stroke } from './draw.ts'
import { effectDensity, lowQuality, motionScale } from './lab.ts'
import { accel, cubic, lerp, lerpPt, muzzle, perpendicular, smooth, type Pt } from './motion.ts'
import type { AttackStyle } from './style.ts'

export interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  rot: number
  spin: number
  grav: number
  color: number
  kind: number
  on: boolean
}

export interface Fx {
  x: number
  y: number
  age: number
  life: number
  size: number
  color: number
  kind: number
  rot: number
}

export interface AttackCtx {
  g: Graphics
  glow: Graphics
  from: Pt
  to: Pt
  team: TeamId
  t: number
  age: number
  unit: number
  seed: number
  motif: string
  style: AttackStyle
  count: number
  emit: (mote: Omit<Mote, 'on' | 'max'> & { max?: number }) => void
  fx: (item: Omit<Fx, 'age'>) => void
  orb: (x: number, y: number, size: number, color: number, alpha: number) => void
  streak: (x: number, y: number, len: number, thick: number, rot: number, color: number, alpha: number) => void
}

const TAU = Math.PI * 2

export function drawAttack(ctx: AttackCtx): Pt {
  switch (ctx.style) {
    case 'comet':
      return drawComet(ctx)
    case 'portal':
      return drawPortal(ctx)
    case 'rose':
      return drawRose(ctx)
    case 'maple':
      return drawMaple(ctx)
    case 'star':
      return drawStar(ctx)
    case 'vortex':
      return drawVortex(ctx)
    case 'planet':
      return drawPlanet(ctx)
    case 'crystal':
      return drawCrystal(ctx)
    case 'eclipse':
      return drawEclipse(ctx)
    default:
      return drawPulse(ctx)
  }
}

function budget(base: number): number {
  return Math.max(1, Math.round(base * effectDensity() * (lowQuality() ? 0.7 : 1)))
}

function drawPulse(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const head = flight(ctx, 0.16, 0.8, ctx.unit * (18 + ctx.seed * 4), 1)
  const thick = Math.min(6, ctx.count)
  if (ctx.t < 0.2) {
    const a = ctx.age * 9 + ctx.seed
    ctx.g.arc(ctx.from.x, ctx.from.y, 16 * ctx.unit, a, a + 1.3).stroke({ width: 1.6, color: ink.core, alpha: 0.9 })
  }
  if (head.u < 1) {
    const pts = ribbon(ctx, head.u, ctx.unit * 16)
    stroke(ctx.glow, pts, (4 + thick) * ctx.unit, ink.hot, 0.35)
    stroke(ctx.g, pts, (1.4 + thick * 0.25) * ctx.unit, ink.core, 0.9)
    ctx.streak(head.point.x, head.point.y, 22 * ctx.unit, 4 * ctx.unit, head.ang, ink.hot, 0.8)
    if (ctx.motif === 'note') note(ctx.g, head.point.x, head.point.y, 7 * ctx.unit, ink.metal)
    else if (ctx.motif === 'stamp') ctx.g.roundRect(head.point.x - 7, head.point.y - 5, 14, 10, 2).stroke({ width: 1.4, color: ink.core, alpha: 0.9 })
    else if (ctx.team === 'red') maple(ctx.g, head.point.x, head.point.y, 5.5 * ctx.unit, ink.hot, 0.95, head.ang)
    else star(ctx.g, head.point.x, head.point.y, 5.5 * ctx.unit, ink.metal, 0.95, head.ang)
    if (ctx.age % 0.08 < ctx.t && budget(2) > 1) {
      ctx.emit({ x: head.point.x, y: head.point.y, vx: 0, vy: -20, life: 0.25, size: 1.6 * ctx.unit, rot: ctx.seed, spin: 2, grav: 10, color: ink.spark, kind: ctx.team === 'red' ? 1 : 2 })
    }
    return head.point
  }
  const k = smooth((ctx.t - 0.8) / 0.2)
  ctx.orb(ctx.to.x, ctx.to.y, (8 + k * 16) * ctx.unit, ink.core, 1 - k)
  ctx.g.circle(ctx.to.x, ctx.to.y, (3 + k * 10) * ctx.unit).stroke({ width: 1.2, color: ink.hot, alpha: 1 - k })
  return ctx.to
}

function drawComet(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const gold = 0xf0c56a
  if (ctx.t < 0.28) {
    const open = smooth(ctx.t / 0.28)
    crown(ctx.g, ctx.from.x, ctx.from.y - (18 + open * 10) * ctx.unit, (8 + open * 4) * ctx.unit, ctx.motif === 'visor' ? ink.metal : gold, 0.95)
    ctx.orb(ctx.from.x, ctx.from.y, (20 + open * 16) * ctx.unit, ink.hot, 0.35)
    return ctx.from
  }
  const head = flight(ctx, 0.28, 0.78, ctx.unit * 36, 0.65)
  if (head.u < 1) {
    const squash = ctx.t < 0.4 ? 1 - (ctx.t - 0.28) / 0.12 : 1
    ctx.streak(head.point.x, head.point.y, 36 * ctx.unit, 8 * ctx.unit * squash, head.ang, gold, 0.75)
    ctx.orb(head.point.x, head.point.y, 16 * ctx.unit, ink.hot, 0.45)
    ctx.g.ellipse(head.point.x, head.point.y, 8 * ctx.unit, 4.5 * ctx.unit * squash).fill({ color: gold, alpha: 0.95 })
    ctx.g.circle(head.point.x, head.point.y, 2.2 * ctx.unit).fill({ color: 0xffffff, alpha: 1 })
    return head.point
  }
  const k = smooth((ctx.t - 0.78) / 0.22)
  ctx.g.circle(ctx.to.x, ctx.to.y, (10 + k * 46) * ctx.unit).stroke({ width: 3 * (1 - k), color: gold, alpha: 0.9 })
  ctx.g.circle(ctx.to.x, ctx.to.y, (6 + k * 22) * ctx.unit).stroke({ width: 1.4, color: ink.core, alpha: 1 - k })
  crown(ctx.g, ctx.to.x, ctx.to.y - 8 * k, 10 * ctx.unit * (1 - k * 0.4), gold, 1 - k)
  return ctx.to
}

function drawPortal(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const n = perpendicular(ctx.from, ctx.to)
  const open = smooth(Math.min(1, ctx.t / 0.18))
  const fold = ctx.t > 0.88 ? smooth((ctx.t - 0.88) / 0.12) : 0
  const span = (1 - fold) * open
  const left = { x: ctx.from.x + n.x * 22 * ctx.unit, y: ctx.from.y + n.y * 22 * ctx.unit }
  const right = { x: ctx.from.x - n.x * 22 * ctx.unit, y: ctx.from.y - n.y * 22 * ctx.unit }
  portalRing(ctx.g, left.x, left.y, 12 * ctx.unit * span, 18 * ctx.unit * span, ink.metal, 0.9)
  portalRing(ctx.g, right.x, right.y, 12 * ctx.unit * span, 18 * ctx.unit * span, ink.hot, 0.85)
  silhouette(ctx.g, left.x, left.y, 7 * ctx.unit * span, ink.core, 0.55)
  silhouette(ctx.g, right.x, right.y, 7 * ctx.unit * span, ink.spark, 0.45)
  let last = ctx.from
  for (let i = 0; i < 3; i += 1) {
    const start = 0.2 + i * 0.08
    const hit = 0.58 + i * 0.14
    if (ctx.t < start) continue
    const u = smooth(Math.min(1, (ctx.t - start) / (hit - start)))
    const bend = (i - 1) * 48 * ctx.unit
    const origin = i === 1 ? ctx.from : i === 0 ? left : right
    const aim = { x: ctx.to.x, y: ctx.to.y + (i - 1) * 18 * ctx.unit }
    const c1 = lerpPt(origin, aim, 0.3)
    const c2 = lerpPt(origin, aim, 0.7)
    c1.x += n.x * bend
    c1.y += n.y * bend
    c2.x -= n.x * bend * 0.4
    c2.y -= n.y * bend * 0.4
    const p = cubic(origin, c1, c2, aim, u)
    const color = ctx.motif === 'coin' ? 0xf0c56a : ctx.motif === 'confetti' ? (i % 2 ? ink.metal : ink.hot) : ink.core
    ctx.orb(p.x, p.y, 10 * ctx.unit, color, 0.4)
    if (ctx.motif === 'confetti') ctx.g.rect(p.x, p.y, 4, 2).fill({ color, alpha: 0.9 })
    else if (ctx.motif === 'coin') ctx.g.ellipse(p.x, p.y, 5, 3).stroke({ width: 1.3, color: 0xf0c56a, alpha: 0.95 })
    else silhouette(ctx.g, p.x, p.y, 5 * ctx.unit, color, 0.8)
    if (u >= 1) {
      const k = smooth(Math.min(1, (ctx.t - hit) / 0.12))
      ctx.g.ellipse(aim.x, aim.y, (8 + k * 20) * ctx.unit, (5 + k * 12) * ctx.unit).stroke({ width: 1.4 * (1 - k), color: ink.metal, alpha: 0.85 })
    }
    last = u >= 1 ? aim : p
  }
  return last
}

function drawRose(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const nose = muzzle(ctx.from, ctx.to, 18 * ctx.unit)
  if (ctx.t < 0.34) {
    const open = smooth(ctx.t / 0.34)
    const bud = { x: nose.x, y: nose.y - (1 - open) * 16 * ctx.unit }
    if (ctx.motif !== 'heart') {
      stem(ctx.g, { x: bud.x, y: bud.y + 16 * ctx.unit }, bud, 2.2 * ctx.unit)
      roseHead(ctx.g, bud.x, bud.y, (8 + open * 8) * ctx.unit, ctx.age, open, ctx.team)
    } else {
      ctx.g.circle(bud.x - 4, bud.y, 5 * open).fill({ color: ink.hot, alpha: 0.9 })
      ctx.g.circle(bud.x + 4, bud.y, 5 * open).fill({ color: ink.hot, alpha: 0.9 })
      ctx.g.poly([bud.x - 8, bud.y + 2, bud.x + 8, bud.y + 2, bud.x, bud.y + 12]).fill({ color: ink.deep, alpha: 0.9 })
    }
    ctx.orb(bud.x, bud.y, 18 * ctx.unit, ink.metal, 0.25 * open)
    return bud
  }
  const head = flight(ctx, 0.34, 0.74, ctx.unit * 22, 0.4)
  if (head.u < 1) {
    const back = { x: head.point.x - Math.cos(head.ang) * 16 * ctx.unit, y: head.point.y - Math.sin(head.ang) * 16 * ctx.unit }
    if (ctx.motif === 'mist') {
      ctx.orb(head.point.x, head.point.y, 20 * ctx.unit, ink.metal, 0.35)
      roseHead(ctx.g, head.point.x, head.point.y, 7 * ctx.unit, head.ang, 0.7, ctx.team)
    } else if (ctx.motif !== 'heart') {
      stem(ctx.g, head.point, back, 2 * ctx.unit)
      roseHead(ctx.g, back.x, back.y, 9 * ctx.unit, head.ang, 1, ctx.team)
    }
    if (ctx.motif !== 'mist' && (ctx.age * 8) % 1 < 0.2) {
      ctx.emit({
        x: back.x, y: back.y, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 20,
        life: 0.8, size: (3 + Math.random() * 3) * ctx.unit, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 6,
        grav: 90, color: ctx.team === 'red' ? 0xc0183a : 0xd7c2a4, kind: 3,
      })
    }
    return head.point
  }
  const k = smooth((ctx.t - 0.74) / 0.26)
  for (let i = 0; i < 6; i += 1) {
    const a = ctx.seed + i
    const rad = (8 + k * 28) * ctx.unit
    ctx.g.arc(ctx.to.x, ctx.to.y, rad, a, a + 0.7).stroke({ width: 1.5 * (1 - k), color: 0x2f6a3c, alpha: 0.8 })
  }
  ctx.g.circle(ctx.to.x, ctx.to.y, (8 + k * 34) * ctx.unit).stroke({ width: 2 * (1 - k), color: ink.metal, alpha: 0.7 })
  if (k < 0.4) {
    for (let i = 0; i < budget(8); i += 1) {
      const a = (i / 8) * TAU
      ctx.emit({
        x: ctx.to.x, y: ctx.to.y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 20 - 30,
        life: 1.1, size: (4 + (i % 3)) * ctx.unit, rot: a, spin: 2 + i, grav: 110,
        color: i % 2 ? 0xc0183a : 0xf0c49a, kind: 3,
      })
    }
  }
  return ctx.to
}

function drawMaple(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const usa = ctx.team === 'blue'
  if (ctx.t < 0.36) {
    const grow = smooth(ctx.t / 0.36)
    const y = ctx.from.y - (22 + grow * 18) * ctx.unit
    ctx.orb(ctx.from.x, y, (16 + grow * 20) * ctx.unit, usa ? ink.hot : 0xffb15a, 0.4)
    if (usa) star(ctx.g, ctx.from.x, y, (6 + grow * 10) * ctx.unit, ink.metal, 0.95, ctx.age * 4)
    else maple(ctx.g, ctx.from.x, y, (6 + grow * 12) * ctx.unit, ink.hot, 0.95, ctx.age * 3)
    return { x: ctx.from.x, y }
  }
  const dive = accel((ctx.t - 0.36) / 0.42)
  const rise = ctx.t < 0.48 ? Math.sin(((ctx.t - 0.36) / 0.12) * Math.PI) * 28 * ctx.unit : 0
  const p = { x: lerp(ctx.from.x, ctx.to.x, Math.min(1, dive)), y: lerp(ctx.from.y - 30 * ctx.unit, ctx.to.y, Math.min(1, dive)) - rise }
  const ang = Math.atan2(ctx.to.y - p.y, ctx.to.x - p.x)
  ctx.streak(p.x, p.y, 40 * ctx.unit, 8 * ctx.unit, ang, usa ? ink.hot : 0xff8a3a, 0.7)
  if (usa) star(ctx.g, p.x, p.y, 11 * ctx.unit, ink.metal, 1, ang)
  else maple(ctx.g, p.x, p.y, 13 * ctx.unit, ctx.motif === 'ember' ? 0xff6a2a : ink.hot, 1, ang)
  if (ctx.motif === 'ring') ctx.g.ellipse(p.x, p.y, 8, 5).stroke({ width: 3, color: 0xf0c49a, alpha: 0.9 })
  if ((ctx.age * 10) % 1 < 0.25) ctx.emit({ x: p.x, y: p.y, vx: (Math.sin(ctx.seed + ctx.age) ) * 16, vy: -8, life: 0.45, size: 2 * ctx.unit, rot: 0, spin: 1, grav: -20, color: usa ? ink.spark : 0xffc27a, kind: 0 })
  if (dive >= 1) {
    const k = smooth((ctx.t - 0.78) / 0.22)
    if (usa) star(ctx.g, ctx.to.x, ctx.to.y, (16 + k * 20) * ctx.unit, ink.metal, 1 - k, 0)
    else maple(ctx.g, ctx.to.x, ctx.to.y, (18 + k * 16) * ctx.unit, ink.hot, 0.85 * (1 - k * 0.3), 0)
    ctx.g.circle(ctx.to.x, ctx.to.y, (6 + k * 18) * ctx.unit).stroke({ width: 1.2, color: 0xffe0b0, alpha: 1 - k })
    return ctx.to
  }
  return p
}

function drawStar(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const canada = ctx.team === 'red'
  const color = canada ? 0xffd0dc : ink.metal
  const line = canada ? ink.hot : ink.hot
  if (ctx.t < 0.42) {
    const spin = ctx.age * (ctx.motif === 'bolt' ? 2 : 1.4)
    const pts: Pt[] = []
    for (let i = 0; i < 5; i += 1) {
      const a = spin + (i / 5) * TAU
      const p = { x: ctx.from.x + Math.cos(a) * 20 * ctx.unit, y: ctx.from.y + Math.sin(a) * 16 * ctx.unit }
      pts.push(p)
      star(ctx.g, p.x, p.y, 4.5 * ctx.unit, color, 0.95)
    }
    if (ctx.t > 0.16) {
      const flat: number[] = []
      for (const p of pts) flat.push(p.x, p.y)
      flat.push(pts[0]!.x, pts[0]!.y)
      stroke(ctx.g, flat, 1.2, line, 0.8)
    }
    return ctx.from
  }
  const u = smooth(Math.min(1, (ctx.t - 0.42) / 0.28))
  const p = lerpPt(ctx.from, ctx.to, u)
  const ang = Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x)
  if (ctx.motif === 'bolt') {
    const jag: number[] = [ctx.from.x, ctx.from.y]
    for (let i = 1; i <= 4; i += 1) {
      const q = lerpPt(ctx.from, ctx.to, (i / 4) * u)
      jag.push(q.x + (i % 2 ? 8 : -8) * ctx.unit, q.y)
    }
    stroke(ctx.glow, jag, 8, ink.core, 0.45)
    stroke(ctx.g, jag, 2, color, 0.95)
  } else {
    ctx.streak(p.x, p.y, 70 * ctx.unit, 5 * ctx.unit, ang, line, 0.85)
    ctx.streak(p.x, p.y, 40 * ctx.unit, 1.6 * ctx.unit, ang, 0xffffff, 0.9)
    ctx.g.circle(ctx.from.x, ctx.from.y, 18 * ctx.unit).stroke({ width: 1.5, color: color, alpha: 0.7 })
  }
  if (u >= 1) {
    const k = smooth((ctx.t - 0.7) / 0.3)
    for (let i = 0; i < 5; i += 1) {
      const a = -0.6 + i * 0.3
      const ray = { x: ctx.to.x + Math.cos(ang + a) * (16 + k * 40) * ctx.unit, y: ctx.to.y + Math.sin(ang + a) * (10 + k * 24) * ctx.unit }
      stroke(ctx.g, [ctx.to.x, ctx.to.y, ray.x, ray.y], 1.3, color, 1 - k)
      star(ctx.g, ray.x, ray.y, 3.5 * ctx.unit, ink.core, 1 - k)
    }
    return ctx.to
  }
  return p
}

function drawVortex(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const wander = Math.sin(ctx.age * 3.2 + ctx.seed) * 26 * ctx.unit
  const n = perpendicular(ctx.from, ctx.to)
  const travel = smooth(Math.min(1, Math.max(0, (ctx.t - 0.16) / 0.7)))
  const base = lerpPt(ctx.from, ctx.to, travel)
  const p = { x: base.x + n.x * wander * (1 - travel), y: base.y + n.y * wander * 0.4 }
  const h = (46 + Math.sin(ctx.age * 5) * 6) * ctx.unit * motionScale()
  const layers = lowQuality() ? 4 : 7
  for (let i = 0; i < layers; i += 1) {
    const t = i / layers
    const y = p.y - h * t
    const rx = (7 + t * 16) * ctx.unit
    const spin = ctx.age * (4 + i) 
    ctx.g.ellipse(p.x + Math.sin(spin) * 2, y, rx, rx * 0.38).stroke({ width: 1.6, color: i % 2 ? ink.hot : ink.core, alpha: 0.55 })
  }
  const bits = budget(ctx.motif === 'bolt' ? 6 : 8)
  for (let i = 0; i < bits; i += 1) {
    const a = ctx.age * 6 + i
    const rad = (8 + (i % 4) * 4) * ctx.unit
    const x = p.x + Math.cos(a) * rad
    const y = p.y - (i / bits) * h + Math.sin(a) * 4
    if (ctx.team === 'red') maple(ctx.g, x, y, 3.2 * ctx.unit, i % 2 ? 0xfff6ea : ink.hot, 0.9, a)
    else star(ctx.g, x, y, 3 * ctx.unit, ink.metal, 0.9, a)
  }
  if (ctx.t > 0.86) {
    const k = smooth((ctx.t - 0.86) / 0.14)
    ctx.g.ellipse(p.x, p.y, (12 + k * 50) * ctx.unit, 8 * ctx.unit).stroke({ width: 2 * (1 - k), color: ink.core, alpha: 0.7 })
  }
  return p
}

function drawPlanet(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  if (ctx.t < 0.3) {
    const s = smooth(ctx.t / 0.3) * 16 * ctx.unit
    ctx.g.circle(ctx.from.x, ctx.from.y - 24 * ctx.unit, 34 * ctx.unit).fill({ color: 0x10141e, alpha: 0.18 * smooth(ctx.t / 0.2) })
    planetBody(ctx.g, ctx.from.x, ctx.from.y - 24 * ctx.unit, s, ctx.age, ctx.team)
    const moonA = ctx.age * 3
    ctx.g.circle(ctx.from.x + Math.cos(moonA) * 22 * ctx.unit, ctx.from.y - 24 * ctx.unit + Math.sin(moonA) * 8, 3).fill({ color: ink.metal, alpha: 0.9 })
    ctx.g.circle(ctx.from.x + Math.cos(moonA + 2) * 16 * ctx.unit, ctx.from.y - 24 * ctx.unit + Math.sin(moonA + 2) * 6, 2).fill({ color: ink.spark, alpha: 0.9 })
    return ctx.from
  }
  const u = accel((ctx.t - 0.3) / 0.5)
  const origin = { x: ctx.from.x, y: ctx.from.y - 24 * ctx.unit }
  const p = lerpPt(origin, ctx.to, Math.min(1, u))
  planetBody(ctx.g, p.x, p.y, 14 * ctx.unit, ctx.age, ctx.team)
  const lead = lerpPt(origin, ctx.to, Math.min(1, u * 1.15))
  ctx.g.circle(lead.x, lead.y, 3.2 * ctx.unit).fill({ color: ink.metal, alpha: 0.95 })
  if (ctx.motif === 'convoy') {
    for (let i = 1; i <= 3; i += 1) {
      const q = lerpPt(origin, ctx.to, Math.max(0, u - i * 0.08))
      ctx.g.roundRect(q.x - 6, q.y - 3, 12, 6, 2).fill({ color: ink.metal, alpha: 0.8 })
    }
  }
  ctx.orb(p.x, p.y, 28 * ctx.unit, ink.hot, 0.25)
  if (u >= 1) {
    const k = smooth((ctx.t - 0.8) / 0.2)
    ctx.g.circle(ctx.to.x, ctx.to.y, (12 + k * 54) * ctx.unit).stroke({ width: 3 * (1 - k), color: ink.deep, alpha: 0.75 })
    ctx.g.circle(ctx.to.x, ctx.to.y, (6 + k * 24) * ctx.unit).stroke({ width: 1.5, color: ink.core, alpha: 1 - k })
    return ctx.to
  }
  return p
}

function drawCrystal(ctx: AttackCtx): Pt {
  const hue = ctx.team === 'red' ? 0xffd0c8 : 0xb9dcff
  if (ctx.t < 0.34) {
    const grow = smooth(ctx.t / 0.34)
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i - 2) * 0.45
      const len = (10 + grow * 22) * ctx.unit
      crystalShard(ctx.g, ctx.from.x, ctx.from.y, len, a, hue, 0.85)
    }
    if (ctx.motif !== 'shard') crown(ctx.g, ctx.from.x, ctx.from.y - 24 * grow * ctx.unit, 8 * ctx.unit, hue, grow)
    return ctx.from
  }
  const u = smooth(Math.min(1, (ctx.t - 0.34) / 0.36))
  const p = lerpPt(ctx.from, ctx.to, u)
  const ang = Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x)
  if (ctx.motif === 'shard') {
    crystalShard(ctx.g, p.x, p.y, 16 * ctx.unit, ang, hue, 0.9)
  } else {
    for (let i = 0; i < 4; i += 1) {
      crystalShard(ctx.g, p.x - Math.cos(ang) * i * 7, p.y - Math.sin(ang) * i * 7, (18 - i * 2) * ctx.unit, ang + i * 0.2, i % 2 ? 0xffffff : hue, 0.8)
    }
  }
  ctx.streak(p.x, p.y, 28 * ctx.unit, 4, ang, hue, 0.45)
  if (u >= 1 && ctx.motif !== 'shard') {
    const k = smooth((ctx.t - 0.7) / 0.3)
    for (let i = 0; i < 4; i += 1) {
      const x = ctx.to.x + (i - 1.5) * 16 * ctx.unit
      const h = (10 + k * 28) * ctx.unit * (1 - Math.max(0, k - 0.65) * 2)
      crystalShard(ctx.g, x, ctx.to.y, Math.max(2, h), -Math.PI / 2, hue, 0.8 * (1 - Math.max(0, k - 0.7)))
    }
    ctx.g.circle(ctx.to.x, ctx.to.y, (8 + k * 40) * ctx.unit).stroke({ width: 1.6 * (1 - k), color: 0xffffff, alpha: 0.8 })
    if (k > 0.74 && k < 0.8) {
      for (let i = 0; i < budget(8); i += 1) {
        const a = (i / 8) * TAU
        ctx.emit({ x: ctx.to.x, y: ctx.to.y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 30 - 10, life: 0.7, size: 4 * ctx.unit, rot: a, spin: 3, grav: 40, color: i % 2 ? hue : 0xffffff, kind: 4 })
      }
    }
    return ctx.to
  }
  return p
}

function drawEclipse(ctx: AttackCtx): Pt {
  const ink = inkOf(ctx.team)
  const cx = (ctx.from.x + ctx.to.x) * 0.5
  const cy = Math.min(ctx.from.y, ctx.to.y) - 10 * ctx.unit
  const open = smooth(Math.min(1, ctx.t / 0.25))
  ctx.g.circle(cx, cy, 54 * ctx.unit * open).fill({ color: 0x120814, alpha: 0.28 * open })
  ctx.g.circle(cx, cy, 28 * ctx.unit * open).fill({ color: 0x1a1020, alpha: 0.55 })
  ctx.g.circle(cx, cy, 34 * ctx.unit * open).stroke({ width: 3, color: ink.hot, alpha: 0.45 * open })
  ctx.orb(ctx.from.x, ctx.from.y, (22 + open * 18) * ctx.unit, ink.core, 0.45)
  for (let i = 0; i < 2; i += 1) {
    const a = ctx.age * (i ? -1.4 : 1.6)
    const pts: number[] = []
    for (let s = 0; s <= 8; s += 1) {
      const t = s / 8
      pts.push(ctx.from.x + Math.cos(a + t * 3) * (10 + t * 16) * ctx.unit, ctx.from.y - t * 70 * ctx.unit * open + Math.sin(a + t * 4) * 8)
    }
    stroke(ctx.glow, pts, 6, i ? ink.hot : (ctx.team === 'red' ? 0x7eb6ff : 0xff8aa8), 0.35)
  }
  const wave = smooth(Math.min(1, Math.max(0, (ctx.t - 0.34) / 0.4)))
  const front = lerpPt(ctx.from, ctx.to, wave)
  ctx.g.ellipse(front.x, front.y, 18 * ctx.unit + wave * 20, 10 * ctx.unit).stroke({ width: 2, color: ink.core, alpha: 0.65 })
  if (ctx.t > 0.72) {
    const k = smooth((ctx.t - 0.72) / 0.28)
    ctx.g.circle(ctx.to.x, ctx.to.y, (12 + k * 48) * ctx.unit).stroke({ width: 2.4 * (1 - k), color: ink.hot, alpha: 0.8 })
    for (let i = 0; i < 3; i += 1) {
      ctx.g.circle(ctx.to.x, ctx.to.y, (8 + i * 7 + k * 10) * ctx.unit).stroke({ width: 1, color: 0xffffff, alpha: (1 - k) * (1 - i * 0.25) })
    }
  }
  return wave > 0 ? front : ctx.from
}

function flight(ctx: AttackCtx, start: number, hit: number, bend: number, curve: number): { point: Pt; u: number; ang: number } {
  const span = Math.max(0.05, hit - start)
  const u = smooth(Math.min(1, Math.max(0, (ctx.t - start) / span)))
  const n = perpendicular(ctx.from, ctx.to)
  const side = Math.sin(ctx.seed) >= 0 ? 1 : -1
  const c1 = lerpPt(ctx.from, ctx.to, 0.33)
  const c2 = lerpPt(ctx.from, ctx.to, 0.66)
  c1.x += n.x * bend * side
  c1.y += n.y * bend * side
  c2.x -= n.x * bend * side * curve
  c2.y -= n.y * bend * side * curve
  const point = cubic(ctx.from, c1, c2, ctx.to, u)
  const ahead = cubic(ctx.from, c1, c2, ctx.to, Math.min(1, u + 0.04))
  return { point, u, ang: Math.atan2(ahead.y - point.y, ahead.x - point.x) }
}

function ribbon(ctx: AttackCtx, u: number, bend: number): number[] {
  const n = perpendicular(ctx.from, ctx.to)
  const side = Math.sin(ctx.seed * 2) >= 0 ? 1 : -1
  const pts: number[] = []
  const steps = lowQuality() ? 6 : 10
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * u
    const wave = Math.sin(t * Math.PI * 2) * bend * side * (1 - t * 0.35)
    const p = lerpPt(ctx.from, ctx.to, t)
    pts.push(p.x + n.x * wave, p.y + n.y * wave)
  }
  return pts
}

function note(g: Graphics, x: number, y: number, s: number, color: number): void {
  g.ellipse(x, y, s * 0.55, s * 0.35).fill({ color, alpha: 0.95 })
  g.moveTo(x + s * 0.4, y)
  g.lineTo(x + s * 0.4, y - s * 1.5)
  g.stroke({ width: 1.4, color, alpha: 0.95 })
}

export function paintMote(g: Graphics, mote: Mote): void {
  const alpha = Math.max(0, mote.life / mote.max)
  if (mote.kind === 3) petal(g, mote.x, mote.y, mote.rot, mote.size, mote.color, alpha)
  else if (mote.kind === 1) maple(g, mote.x, mote.y, mote.size, mote.color, alpha, mote.rot)
  else if (mote.kind === 2) star(g, mote.x, mote.y, mote.size, mote.color, alpha, mote.rot)
  else if (mote.kind === 4) crystalShard(g, mote.x, mote.y, mote.size, mote.rot, mote.color, alpha)
  else g.circle(mote.x, mote.y, mote.size).fill({ color: mote.color, alpha })
}

export function vortexPoint(from: Pt, to: Pt, t: number, age: number, seed: number, unit: number): Pt {
  const wander = Math.sin(age * 3.2 + seed) * 26 * unit
  const n = perpendicular(from, to)
  const travel = smooth(Math.min(1, Math.max(0, (t - 0.16) / 0.7)))
  const base = lerpPt(from, to, travel)
  return { x: base.x + n.x * wander * (1 - travel), y: base.y + n.y * wander * 0.4 }
}
