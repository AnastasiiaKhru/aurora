import type { Graphics } from 'pixi.js'
import type { AttackCommand } from '../../types/Battle.ts'
import { star } from './draw.ts'
import { drawLiveLook, isAutoBasic, isCatalogGift, quickTravel } from './liveLook.ts'
import { perpendicular, type Pt } from './motion.ts'

export type BlasterKind = 'like' | 'follow' | 'share' | 'small' | 'medium' | 'big'

export interface BoltPaint {
  core: number
  glow: number
  shade: number
  hot: number
  spark: number
}

const PAINT: Record<BlasterKind, BoltPaint> = {
  like: { core: 0xff4d88, glow: 0xff2468, shade: 0x2a0614, hot: 0xffffff, spark: 0xffc4e4 },
  follow: { core: 0x7dffc8, glow: 0x2ee6a6, shade: 0x062010, hot: 0xffffff, spark: 0xd8ffe8 },
  share: { core: 0xe2a6ff, glow: 0xb44dff, shade: 0x160818, hot: 0xfff7ff, spark: 0xf6d8ff },
  small: { core: 0xff5ad8, glow: 0xff2aa6, shade: 0x2a0618, hot: 0xfff2fb, spark: 0xffc8ee },
  medium: { core: 0xffc24a, glow: 0xff7a12, shade: 0x2a1204, hot: 0xfff8dc, spark: 0xffe4a8 },
  big: { core: 0xffd56a, glow: 0xff9a1a, shade: 0x2a1604, hot: 0xfffaf0, spark: 0xffe2a0 },
}

const LIKE_RED: BoltPaint = { core: 0xff4d88, glow: 0xff1a62, shade: 0x2a0614, hot: 0xfff6fb, spark: 0xffc4e4 }

const LOOK: Record<BlasterKind, { len: number; thick: number; trail: number; orb: boolean; impact: number }> = {
  like: { len: 240, thick: 18, trail: 0.62, orb: false, impact: 52 },
  follow: { len: 380, thick: 30, trail: 0.72, orb: true, impact: 96 },
  share: { len: 360, thick: 28, trail: 0.74, orb: true, impact: 92 },
  small: { len: 300, thick: 24, trail: 0.68, orb: true, impact: 78 },
  medium: { len: 420, thick: 32, trail: 0.76, orb: true, impact: 112 },
  big: { len: 260, thick: 16, trail: 0.48, orb: true, impact: 64 },
}

const TRAVEL: Record<BlasterKind, number> = {
  like: 0.18,
  follow: 0.25,
  share: 0.23,
  small: 0.29,
  medium: 0.33,
  big: 0.41,
}

export function blasterKind(command: { giftName?: string; attackType?: string; rarity?: string; ambient?: boolean }): BlasterKind {
  if (command.ambient && command.rarity !== 'large' && command.rarity !== 'legendary' && command.rarity !== 'medium') return 'like'
  const name = (command.giftName ?? '').trim().toLowerCase()
  const attack = command.attackType ?? ''
  if (name === 'like' || name === 'comment' || name.endsWith(' likes') || attack === 'pulse') return 'like'
  if (name === 'follow' || attack === 'follow_blast') return 'follow'
  if (name === 'share' || attack === 'share_shot') return 'share'
  if (command.rarity === 'large' || command.rarity === 'legendary') return 'big'
  if (command.rarity === 'medium') return 'medium'
  return 'small'
}

export function blasterPaint(command: { giftName?: string; attackType?: string; rarity?: string; team?: string }): BoltPaint {
  const kind = blasterKind(command)
  if (kind === 'like' && command.team === 'red') return LIKE_RED
  return PAINT[kind]
}

/** Draw scale so gifts read larger than a like without filling the capture. */
export function visualPunch(command: { giftName?: string; attackType?: string; rarity?: string; ambient?: boolean; power?: number }): number {
  const kind = blasterKind(command)
  const power = Math.sqrt(Math.max(1, command.power ?? 1))
  if (kind === 'like') return Math.min(1.08, 0.96 * power)
  if (kind === 'follow') return Math.min(1.28, 1.08 * power)
  if (kind === 'share') return Math.min(1.32, 1.12 * power)
  if (kind === 'small') return Math.min(1.36, 1.1 * power)
  if (kind === 'medium') return Math.min(1.5, 1.18 * power)
  return Math.min(1.12, 1.02 * power)
}

/** Playback rate so the projectile arrives in the requested window. Damage still lands on impact. */
export function flightRate(command: { duration: number; impacts: number[]; giftName?: string; attackType?: string; rarity?: string; ambient?: boolean }): number {
  const duration = Math.max(0.05, command.duration)
  const marks = command.impacts.length > 0 ? command.impacts : [0.75]
  const kind = blasterKind(command)
  const hit = Math.max(0.05, marks[0] ?? 0.75)
  const catalog = !command.ambient && isCatalogGift(command.giftName) ? quickTravel(command.giftName) : null
  const travel = isAutoBasic(command) ? 0.5 : catalog ?? (command.ambient ? TRAVEL[kind] : 0.1)
  return (duration * hit) / travel
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  size: number
  rot: number
  spin: number
  grav: number
  color: number
  kind: number
}

export interface BlasterCtx {
  g: Graphics
  glow: Graphics
  from: Pt
  to: Pt
  t: number
  age: number
  seed: number
  command: AttackCommand
  width: number
  height: number
  scale: number
  quiet: boolean
  sparked: number
  /** Extra landing spots so one shot connects with several opponents. */
  aims?: Pt[]
  markSparked: (bit: number) => void
  emit: (spark: Spark) => void
  orb: (x: number, y: number, size: number, color: number, alpha: number) => void
}

export function drawBlaster(ctx: BlasterCtx): void {
  try {
    if (drawLiveLook(ctx)) return
  } catch {
    // A broken gift shape falls through to the normal blast instead of stopping the frame.
  }
  const kind = blasterKind(ctx.command)
  const paint = blasterPaint(ctx.command)
  const look = LOOK[kind]
  const s = Math.max(0.35, ctx.scale) * (ctx.command.ambient && kind === 'like' ? 0.48 : 1)
  const marks = ctx.command.impacts.length > 0 ? ctx.command.impacts : [0.75]
  const aims = ctx.aims && ctx.aims.length > 0 ? ctx.aims : [ctx.to]
  const count = aims.length
  const flight = Math.max(0.08, marks[0] ?? 0.75)
  const primary = aims[0] ?? ctx.to
  const ang = Math.atan2(primary.y - ctx.from.y, primary.x - ctx.from.x)
  const open = clamp(1 - ctx.t / (flight * 0.1), 0, 1)
  if (open > 0.02) muzzleBurst(ctx, ang, s, paint, look.thick, open)

  for (let i = 0; i < count; i += 1) {
    const dest = aims[i] ?? ctx.to
    const launch = 0
    const arrive = launch + flight
    if (ctx.t < launch) continue
    const raw = clamp((ctx.t - launch) / Math.max(0.04, arrive - launch), 0, 1)
    const span = Math.hypot(dest.x - ctx.from.x, dest.y - ctx.from.y) || 1
    const lead = Math.min(span * 0.035, 14 * s)
    const u = uLead(raw, lead / span)
    const spread = count > 1 ? (i - (count - 1) / 2) * 16 * s : 0
    const bow = spread + (kind === 'like' ? (ctx.seed % 1 - 0.5) * 22 * s : kind === 'share' ? Math.sin(raw * Math.PI) * 10 * s : 0)
    const head = pointAt(ctx.from, dest, u, bow)
    const traveled = u * span
    const trail = Math.min(traveled, Math.max(look.len * s * 0.55, traveled * look.trail))
    const tail = behind(ctx.from, dest, head, trail)
    const boltAng = Math.atan2(dest.y - ctx.from.y, dest.x - ctx.from.x)
    const impactHold = (kind === 'like' ? 0.14 : kind === 'big' ? 0.14 : 0.18) * (flight / TRAVEL[kind])
    const k = u >= 1 ? clamp((ctx.t - arrive) / Math.max(0.04, impactHold), 0, 1) : 0
    if (u < 1 || k < 0.85) {
      const liveTail = u < 1 ? tail : behind(ctx.from, dest, head, trail * (1 - k))
      bolt(ctx, head, liveTail, look.thick * s * (u < 1 ? 1 : 1 - k * 0.35), paint, look.orb, kind)
      const sparkChance = ctx.quiet ? 0.12 : 0.42
      if (u < 1 && (ctx.age * 16 + i) % 1 < sparkChance) dust(ctx, tail, boltAng, s, paint, look.thick, kind)
    }
    if (u >= 1 && k < 1) {
      impact(ctx, dest, k, s, paint, look.impact * (kind === 'big' ? 1 : 0.92), kind)
      const bit = 1 << i
      if ((ctx.sparked & bit) === 0 && k < 0.35) {
        ctx.markSparked(bit)
        burst(ctx, dest, s, paint, kind)
      }
    }
  }
}

function pointAt(from: Pt, to: Pt, u: number, bow: number): Pt {
  const n = perpendicular(from, to)
  const p = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u }
  const arc = Math.sin(u * Math.PI) * bow
  return { x: p.x + n.x * arc, y: p.y + n.y * arc }
}

function behind(from: Pt, to: Pt, head: Pt, dist: number): Pt {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  return { x: head.x - (dx / len) * dist, y: head.y - (dy / len) * dist }
}

function bolt(ctx: BlasterCtx, head: Pt, tail: Pt, thick: number, paint: BoltPaint, orb: boolean, kind: BlasterKind): void {
  const ang = Math.atan2(head.y - tail.y, head.x - tail.x)
  const glowMul = kind === 'big' ? 1.15 : 1.7
  taper(ctx.glow, head, tail, thick * glowMul, paint.glow, kind === 'big' ? 0.28 : 0.42)
  taper(ctx.g, head, tail, thick * (kind === 'big' ? 0.72 : 1.05), paint.glow, 0.9)
  taper(ctx.g, head, tail, thick * (kind === 'big' ? 0.4 : 0.62), paint.core, 1)
  taper(ctx.g, head, tail, thick * (kind === 'big' ? 0.14 : 0.22), paint.hot, 1)
  ctx.g.moveTo(tail.x, tail.y)
  ctx.g.lineTo(head.x, head.y)
  ctx.g.stroke({ width: Math.max(1.6, thick * 0.14), color: paint.hot, alpha: 1, cap: 'round' })
  ctx.orb(head.x, head.y, thick * (kind === 'big' ? 0.7 : orb ? 1.15 : 0.9), paint.glow, kind === 'big' ? 0.22 : 0.32)
  const heartShot = kind === 'small' || (kind === 'like' && ctx.command.team === 'red')
  const size = kind === 'small' ? 1.05 : kind === 'follow' || kind === 'share' ? 0.95 : 0.85
  if (heartShot) {
    heart(ctx.glow, head.x, head.y, thick * size * 1.08, paint.glow, 0.32, ang)
    heart(ctx.g, head.x, head.y, thick * size * 0.92, paint.core, 1, ang)
    heart(ctx.g, head.x, head.y, thick * size * 0.36, paint.hot, 1, ang)
  } else if (kind === 'big') {
    ctx.g.circle(head.x, head.y, thick * 0.34).fill({ color: paint.core, alpha: 1 })
    ctx.g.circle(head.x, head.y, thick * 0.14).fill({ color: paint.hot, alpha: 1 })
  } else if (kind === 'medium') {
    ctx.g.circle(head.x, head.y, thick * 0.55).fill({ color: paint.glow, alpha: 1 })
    ctx.g.circle(head.x, head.y, thick * 0.24).fill({ color: paint.hot, alpha: 1 })
  } else {
    star(ctx.glow, head.x, head.y, thick * size * 1.1, paint.glow, 0.32, ang)
    star(ctx.g, head.x, head.y, thick * size * 0.9, paint.core, 1, ang)
    star(ctx.g, head.x, head.y, thick * size * 0.34, 0xffffff, 1, ang)
  }
  const dx = tail.x - head.x
  const dy = tail.y - head.y
  const sparks = kind === 'big' ? 3 : kind === 'like' ? 4 : 5
  for (let i = 1; i <= sparks; i += 1) {
    const u = i / (sparks + 0.4)
    const n = perpendicular(tail, head)
    const side = (i % 2 === 0 ? 1 : -1) * thick * (kind === 'big' ? 0.16 : 0.28)
    const color = i % 2 === 0 ? paint.hot : paint.spark
    ctx.g.circle(head.x + dx * u + n.x * side, head.y + dy * u + n.y * side, Math.max(1.2, thick * (0.12 - u * 0.04))).fill({
      color,
      alpha: 1,
    })
  }
}

function heart(g: Graphics, x: number, y: number, size: number, color: number, alpha: number, ang: number): void {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const px = -s
  const py = c
  g.circle(x - c * size * 0.2 + px * size * 0.32, y - s * size * 0.2 + py * size * 0.32, size * 0.46).fill({ color, alpha })
  g.circle(x - c * size * 0.2 - px * size * 0.32, y - s * size * 0.2 - py * size * 0.32, size * 0.46).fill({ color, alpha })
  g.poly([
    x + c * size,
    y + s * size,
    x - c * size * 0.15 + px * size * 0.62,
    y - s * size * 0.15 + py * size * 0.62,
    x - c * size * 0.15 - px * size * 0.62,
    y - s * size * 0.15 - py * size * 0.62,
  ]).fill({ color, alpha })
}

function taper(g: Graphics, head: Pt, tail: Pt, width: number, color: number, alpha: number): void {
  if (width < 0.4) return
  g.moveTo(tail.x, tail.y)
  g.lineTo(head.x, head.y)
  g.stroke({ width: Math.max(1.5, width * 2), color, alpha, cap: 'round' })
}

function muzzleBurst(ctx: BlasterCtx, ang: number, s: number, paint: BoltPaint, thick: number, fade: number): void {
  void ang
  const radius = (10 + thick * 0.45) * s * (0.7 + fade * 0.5)
  ctx.glow.circle(ctx.from.x, ctx.from.y, radius * 1.6).fill({ color: paint.glow, alpha: 0.28 * fade })
  ctx.g.circle(ctx.from.x, ctx.from.y, radius).fill({ color: paint.core, alpha: 0.9 * fade })
  ctx.g.circle(ctx.from.x, ctx.from.y, radius * 0.4).fill({ color: paint.hot, alpha: fade })
  ctx.orb(ctx.from.x, ctx.from.y, radius * 1.4, paint.glow, 0.5 * fade)
}

function impact(ctx: BlasterCtx, at: Pt, k: number, s: number, paint: BoltPaint, radius: number, kind: BlasterKind): void {
  const fade = 1 - k
  const wave = radius * s * (0.35 + k * 1.05)
  ctx.orb(at.x, at.y, wave * 0.72, paint.glow, 0.46 * fade)
  ctx.g.circle(at.x, at.y, Math.max(6, radius * 0.28 * s) * (1.1 - k * 0.3)).fill({ color: paint.hot, alpha: fade })
  ctx.g.circle(at.x, at.y, Math.max(3, radius * 0.12 * s)).fill({ color: 0xffffff, alpha: fade })
  ctx.g.circle(at.x, at.y, wave).stroke({ width: Math.max(2.5, (7 - k * 3) * s), color: paint.core, alpha: fade })
  ctx.glow.circle(at.x, at.y, wave * 0.82).stroke({ width: Math.max(2.4, (6 - k * 2) * s), color: paint.glow, alpha: 0.34 * fade })
  const heartHit = kind === 'small' || (kind === 'like' && ctx.command.team === 'red')
  const mark = Math.max(8, radius * 0.22 * s) * (1.15 - k * 0.35)
  if (heartHit) heart(ctx.g, at.x, at.y, mark, paint.hot, fade, -Math.PI / 2)
  else if (kind === 'medium') ctx.g.circle(at.x, at.y, mark * 0.55).fill({ color: paint.hot, alpha: fade })
  else if (kind === 'big') {
    ctx.g.circle(at.x, at.y, mark * 0.45).fill({ color: paint.hot, alpha: fade })
  } else {
    star(ctx.g, at.x, at.y, mark, paint.hot, fade, ctx.age * 4)
    star(ctx.g, at.x, at.y, mark * 0.45, 0xffffff, fade, ctx.age * 4)
  }
  if (kind !== 'like') {
    ctx.g.circle(at.x, at.y, wave * 0.62).stroke({ width: Math.max(1.4, 2.2 * s * fade), color: paint.hot, alpha: fade })
  }
  if (kind === 'follow') {
    ctx.g.circle(at.x, at.y, wave * 1.2).stroke({ width: Math.max(2, 3.2 * s * fade), color: paint.core, alpha: fade })
  }
  if (kind === 'medium') {
    ctx.g.circle(at.x, at.y, wave * 1.28).stroke({ width: Math.max(1.6, 2.6 * s * fade), color: paint.glow, alpha: fade * 0.95 })
  }
  if (kind === 'big') {
    ctx.g.circle(at.x, at.y, wave * 0.72).stroke({ width: Math.max(1.1, 1.4 * s * fade), color: paint.hot, alpha: fade * 0.7 })
  }
}

function burst(ctx: BlasterCtx, at: Pt, s: number, paint: BoltPaint, kind: BlasterKind): void {
  const bits = kind === 'like' ? 7 : kind === 'share' ? 8 : kind === 'follow' || kind === 'small' ? 10 : kind === 'medium' ? 14 : 8
  const speed = kind === 'like' ? 160 : kind === 'big' ? 140 : 210
  for (let i = 0; i < bits; i += 1) {
    const a = (i / bits) * Math.PI * 2 + ctx.seed
    ctx.emit({
      x: at.x,
      y: at.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: kind === 'like' ? 0.18 : kind === 'big' ? 0.2 : 0.26,
      size: (kind === 'big' ? 2 : 2.6) * s,
      rot: a,
      spin: 6,
      grav: 20,
      color: i % 3 === 0 ? paint.hot : i % 3 === 1 ? paint.core : paint.spark,
      kind: 0,
    })
  }
}

function dust(ctx: BlasterCtx, at: Pt, ang: number, s: number, paint: BoltPaint, thick: number, kind: BlasterKind): void {
  const back = ang + Math.PI + (ctx.seed % 1 - 0.5) * 0.8
  ctx.emit({
    x: at.x,
    y: at.y,
    vx: Math.cos(back) * 46,
    vy: Math.sin(back) * 46,
    life: kind === 'like' ? 0.16 : 0.22,
    size: Math.max(1.8, thick * 0.12) * s,
    rot: back,
    spin: kind === 'share' ? 8 : 4,
    grav: 0,
    color: paint.spark,
    kind: kind === 'share' || kind === 'like' ? 2 : 0,
  })
}

function uLead(raw: number, lead: number): number {
  const start = clamp(lead, 0, 0.28)
  return start + (1 - start) * raw
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
