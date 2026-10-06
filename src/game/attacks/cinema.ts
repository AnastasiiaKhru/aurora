import type { AttackType, GiftRarity } from '../../types/Gift.ts'
import { inkOf, stroke } from './draw.ts'
import { cubic, lerp, lerpPt, perpendicular, smooth, type Pt } from './motion.ts'
import type { AttackCtx } from './play.ts'

/**
 * Cinematic attacks for the gifts we already have.
 * Auto / ambient shots never take this path.
 */
export type CinemaId =
  | 'beam'
  | 'dash'
  | 'barrage'
  | 'lightning'
  | 'inferno'
  | 'vortex'
  | 'orbital'
  | 'blade'
  | 'dragon'
  | 'meteor'
  | 'blackhole'

export type CinemaSound =
  | 'ultimate-charge'
  | 'power-charge'
  | 'power-release'
  | 'laser'
  | 'missile-launch'
  | 'explosion-large'
  | 'lightning'
  | 'fire'
  | 'tornado'
  | 'meteor-fall'
  | 'meteor-impact'
  | 'ultimate-impact'

export interface CinemaSpec {
  id: CinemaId
  duration: number
  scale: number
  chargeEnd: number
  impacts: number[]
  /** 0 hold, 1 cross-field dash, 2 lunge to the team edge */
  move: 0 | 1 | 2
  charge: CinemaSound
  release: CinemaSound
  impact: CinemaSound
}

const TAU = Math.PI * 2

export const cinemaSpecs: Record<CinemaId, CinemaSpec> = {
  beam: { id: 'beam', duration: 8, scale: 1.62, chargeEnd: 0.4, impacts: [0.62], move: 0, charge: 'ultimate-charge', release: 'laser', impact: 'ultimate-impact' },
  dash: { id: 'dash', duration: 8.4, scale: 1.58, chargeEnd: 0.3, impacts: [0.56], move: 1, charge: 'power-charge', release: 'missile-launch', impact: 'explosion-large' },
  barrage: { id: 'barrage', duration: 7.4, scale: 1.55, chargeEnd: 0.28, impacts: [0.84], move: 0, charge: 'power-charge', release: 'missile-launch', impact: 'explosion-large' },
  lightning: { id: 'lightning', duration: 9.4, scale: 1.68, chargeEnd: 0.26, impacts: [0.82], move: 2, charge: 'lightning', release: 'lightning', impact: 'ultimate-impact' },
  inferno: { id: 'inferno', duration: 10, scale: 1.7, chargeEnd: 0.3, impacts: [0.7], move: 0, charge: 'fire', release: 'fire', impact: 'explosion-large' },
  vortex: { id: 'vortex', duration: 9, scale: 1.65, chargeEnd: 0.32, impacts: [0.78], move: 0, charge: 'tornado', release: 'tornado', impact: 'explosion-large' },
  orbital: { id: 'orbital', duration: 8.7, scale: 1.68, chargeEnd: 0.34, impacts: [0.68], move: 0, charge: 'ultimate-charge', release: 'laser', impact: 'ultimate-impact' },
  blade: { id: 'blade', duration: 8.4, scale: 1.55, chargeEnd: 0.3, impacts: [0.6], move: 2, charge: 'power-charge', release: 'power-release', impact: 'explosion-large' },
  dragon: { id: 'dragon', duration: 15.8, scale: 1.95, chargeEnd: 0.3, impacts: [0.72], move: 2, charge: 'ultimate-charge', release: 'fire', impact: 'ultimate-impact' },
  meteor: { id: 'meteor', duration: 17.2, scale: 2.05, chargeEnd: 0.26, impacts: [0.66], move: 0, charge: 'ultimate-charge', release: 'meteor-fall', impact: 'meteor-impact' },
  blackhole: { id: 'blackhole', duration: 19.4, scale: 2.15, chargeEnd: 0.24, impacts: [0.8], move: 0, charge: 'ultimate-charge', release: 'meteor-fall', impact: 'ultimate-impact' },
}

const BY_ID: Record<string, CinemaId> = {
  money_gun: 'barrage',
  train: 'dash',
  galaxy: 'orbital',
  whirlwind: 'vortex',
  prism: 'beam',
  storm: 'lightning',
  inferno: 'inferno',
  sabre: 'blade',
  lion: 'dragon',
  universe: 'meteor',
  tiktok_universe: 'blackhole',
}

const BY_ATTACK: Partial<Record<AttackType, CinemaId>> = {
  missile: 'barrage',
  airstrike: 'dash',
  cosmic: 'orbital',
  tornado: 'vortex',
  laser: 'beam',
  thunderstorm: 'lightning',
  firestorm: 'inferno',
  sword: 'blade',
  dragon: 'dragon',
  meteor: 'meteor',
  black_hole: 'blackhole',
}

export function cinemaOf(command: {
  giftId?: string
  giftName?: string
  attackType?: AttackType
  rarity?: GiftRarity
  ambient?: boolean
  npcKind?: string
}): CinemaSpec | null {
  if (command.ambient || command.npcKind) return null
  if (command.rarity !== 'large' && command.rarity !== 'legendary') return null
  const name = (command.giftName ?? '').trim().toLowerCase()
  if (name === 'maple meteor' || name === 'constellation' || name === 'like' || name === 'follow' || name === 'share' || name === 'rose') return null
  const named = nameOf(name)
  const id = (command.giftId && BY_ID[command.giftId]) || named || (command.attackType ? BY_ATTACK[command.attackType] : undefined)
  return id ? cinemaSpecs[id] : null
}

function nameOf(name: string): CinemaId | undefined {
  if (name.includes('tiktok universe')) return 'blackhole'
  if (name === 'universe') return 'meteor'
  if (name === 'money gun') return 'barrage'
  if (name === 'train') return 'dash'
  if (name === 'galaxy') return 'orbital'
  if (name === 'whirlwind') return 'vortex'
  if (name === 'prism' || name === 'prism laser') return 'beam'
  if (name === 'thunderstorm') return 'lightning'
  if (name === 'inferno') return 'inferno'
  if (name === 'star sabre') return 'blade'
  if (name === 'lion') return 'dragon'
  return undefined
}

export function cinemaPlayerPhase(spec: CinemaSpec, t: number): 1 | 2 | 3 | 4 {
  const hit = spec.impacts[spec.impacts.length - 1] ?? 0.75
  if (t < 0.14) return 1
  if (t < spec.chargeEnd) return 2
  if (t < hit + 0.12) return 3
  return 4
}

export function cinemaScale(spec: CinemaSpec, t: number): number {
  const hit = spec.impacts[spec.impacts.length - 1] ?? 0.75
  if (t < 0.08) return 1.28
  if (t < 0.16) return 1.45
  if (t < hit + 0.1) return spec.scale * 1.5
  return 1.06
}

export function cinemaSpeed(spec: CinemaSpec, t: number): number {
  const hit = spec.impacts[0] ?? 0.7
  if (t < 0.14) return 0.32
  if (t < spec.chargeEnd) return spec.move === 1 ? 2.7 : 2.15
  if (t < hit && spec.move === 1) return 4.8
  if (t < hit && spec.move === 2) return 3.3
  if (t < hit) return 0.4
  return 1.15
}

export function dashBlend(spec: CinemaSpec, t: number): number {
  const hit = spec.impacts[0] ?? 0.6
  const start = spec.chargeEnd
  if (t <= start) return 0
  if (t < hit) return smooth((t - start) / Math.max(0.08, hit - start))
  return 1 - smooth(Math.min(1, (t - hit) / 0.26))
}

export function drawCinema(ctx: AttackCtx, spec: CinemaSpec): Pt {
  const open = smooth(Math.min(1, ctx.t / Math.max(0.08, spec.chargeEnd)))
  const ink = inkOf(ctx.team)
  if (ctx.t < spec.chargeEnd + 0.04) chargeAura(ctx, open, ink.hot, ink.core)
  switch (spec.id) {
    case 'beam':
      return drawBeam(ctx, spec, ink.hot)
    case 'dash':
      return drawDash(ctx, spec, ink.hot)
    case 'barrage':
      return drawBarrage(ctx, spec, ink.hot)
    case 'lightning':
      return drawLightning(ctx, spec)
    case 'inferno':
      return drawInferno(ctx, spec)
    case 'vortex':
      return drawVortex(ctx, spec, ink.hot)
    case 'orbital':
      return drawOrbital(ctx, spec, ink.hot)
    case 'blade':
      return drawBlade(ctx, spec)
    case 'dragon':
      return drawDragon(ctx, spec)
    case 'meteor':
      return drawMeteor(ctx, spec)
    case 'blackhole':
      return drawBlackHole(ctx, spec, ink.hot)
    default:
      return ctx.from
  }
}

function chargeAura(ctx: AttackCtx, open: number, hot: number, core: number): void {
  const spin = ctx.age * 5.5
  const clear = 30 * ctx.unit
  const outer = clear + (18 + open * 16) * ctx.unit
  ctx.g.arc(ctx.from.x, ctx.from.y, outer, spin, spin + 2.2).stroke({ width: 3.2 * ctx.unit, color: hot, alpha: 0.92 })
  ctx.g.arc(ctx.from.x, ctx.from.y, outer + 10 * ctx.unit, -spin * 1.15, -spin * 1.15 + 1.7).stroke({ width: 1.8 * ctx.unit, color: 0xffffff, alpha: 0.75 })
  ctx.g.circle(ctx.from.x, ctx.from.y, clear + 4 * ctx.unit).stroke({ width: 5 * ctx.unit, color: hot, alpha: 0.16 + open * 0.12 })
  for (let i = 0; i < 3; i += 1) {
    const life = (ctx.age * 0.9 + i / 3) % 1
    const rad = clear + (1 - life) * 52 * ctx.unit
    ctx.g.circle(ctx.from.x, ctx.from.y, rad).stroke({ width: 1.6 * ctx.unit, color: core, alpha: (1 - life) * 0.5 * open })
  }
  for (let i = 0; i < 5; i += 1) {
    const a = spin * 1.5 + (i / 5) * TAU
    const rad = outer + 8 * ctx.unit
    ctx.g.circle(ctx.from.x + Math.cos(a) * rad, ctx.from.y + Math.sin(a) * rad * 0.7, 2.5 * ctx.unit).fill({ color: i % 2 ? 0xffffff : hot, alpha: 0.9 })
  }
  for (let i = 0; i < 4; i += 1) {
    const a = ctx.seed + i * 1.5 - ctx.age * 2.2
    const far = clear + 58 * ctx.unit
    const near = clear + 6 * ctx.unit
    stroke(ctx.g, [ctx.from.x + Math.cos(a) * far, ctx.from.y + Math.sin(a) * far, ctx.from.x + Math.cos(a) * near, ctx.from.y + Math.sin(a) * near], 2.2 * ctx.unit, hot, 0.4 * open)
  }
}

function ribbon(ctx: AttackCtx, a: Pt, b: Pt, half: number, color: number, alpha: number): void {
  if (alpha < 0.03 || half < 0.4) return
  stroke(ctx.g, [a.x, a.y, b.x, b.y], half * 2, color, alpha)
  const n = perpendicular(a, b)
  ctx.g.poly([
    a.x + n.x * half, a.y + n.y * half,
    b.x + n.x * half, b.y + n.y * half,
    b.x - n.x * half, b.y - n.y * half,
    a.x - n.x * half, a.y - n.y * half,
  ]).fill({ color, alpha: alpha * 0.85 })
}

function skyY(targetY: number, lift: number): number {
  return Math.max(16, targetY - lift)
}

function sideWash(ctx: AttackCtx, k: number, color: number, power: number): void {
  const fade = 1 - k
  const reach = (110 + k * 260) * ctx.unit * power
  ctx.orb(ctx.to.x, ctx.to.y, reach, color, fade * 0.32)
  ctx.g.ellipse(ctx.to.x, ctx.to.y, reach * 0.9, reach * 0.46).stroke({
    width: Math.max(2, (7 - k * 4) * ctx.unit),
    color,
    alpha: fade * 0.78,
  })
  ctx.g.ellipse(ctx.to.x, ctx.to.y, reach * 1.25, reach * 0.62).stroke({
    width: 2.2 * ctx.unit,
    color: 0xffffff,
    alpha: fade * 0.4,
  })
}

function boom(ctx: AttackCtx, x: number, y: number, k: number, color: number, power: number): void {
  const u = ctx.unit * power
  const fade = 1 - k
  ctx.orb(x, y, (24 + k * 90) * u, 0xffffff, fade * 0.85)
  ctx.orb(x, y, (40 + k * 130) * u, color, fade * 0.45)
  ctx.g.circle(x, y, (10 + k * 22) * u).fill({ color: 0xffffff, alpha: fade * 0.9 })
  ctx.g.circle(x, y, (16 + k * 78) * u).stroke({ width: Math.max(1, (5 - k * 4) * ctx.unit), color, alpha: fade })
  ctx.g.circle(x, y, (8 + k * 40) * u).stroke({ width: 2 * ctx.unit, color: 0xffffff, alpha: fade * 0.8 })
  ctx.g.ellipse(x, y + 8 * ctx.unit, (18 + k * 70) * u, (7 + k * 16) * u).stroke({ width: 3 * fade * ctx.unit, color, alpha: fade * 0.75 })
  if (k < 0.1) {
    const bits = Math.round(8 + power * 4)
    for (let i = 0; i < bits; i += 1) {
      const a = (i / bits) * TAU + ctx.seed
      ctx.emit({
        x, y,
        vx: Math.cos(a) * (90 + power * 50),
        vy: Math.sin(a) * (60 + power * 24) - 16,
        life: 0.55,
        size: (2.4 + (i % 3)) * ctx.unit,
        rot: a,
        spin: 3,
        grav: 30,
        color: i % 3 === 0 ? 0xffffff : color,
        kind: 0,
      })
    }
  }
}

function drawBeam(ctx: AttackCtx, spec: CinemaSpec, hot: number): Pt {
  const hit = spec.impacts[0] ?? 0.62
  if (ctx.t < spec.chargeEnd) return ctx.from
  const quiet = ctx.t < spec.chargeEnd + 0.045
  const ang = Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x)
  const mouth = { x: ctx.from.x + Math.cos(ang) * 32 * ctx.unit, y: ctx.from.y + Math.sin(ang) * 32 * ctx.unit }
  if (quiet) {
    ctx.g.circle(mouth.x, mouth.y, 4 * ctx.unit).fill({ color: 0xffffff, alpha: 0.95 })
    return mouth
  }
  const u = smooth(Math.min(1, (ctx.t - spec.chargeEnd) / Math.max(0.08, hit - spec.chargeEnd)))
  const tip = lerpPt(mouth, ctx.to, u)
  const held = u >= 1 ? 1 - smooth(Math.min(1, Math.max(0, ctx.t - 0.9) / 0.16)) : 1
  ribbon(ctx, mouth, tip, 22 * ctx.unit, hot, 0.55 * held)
  ribbon(ctx, mouth, tip, 7 * ctx.unit, 0xffffff, 0.92 * held)
  const n = perpendicular(mouth, ctx.to)
  const jag = boltAlong(mouth, tip, ctx.seed, 10 * ctx.unit)
  stroke(ctx.g, jag, 2.4 * ctx.unit, 0xf4fbff, 0.9 * held)
  stroke(ctx.glow, jag, 12 * ctx.unit, hot, 0.5 * held)
  for (let i = 0; i < 4; i += 1) {
    const p = lerpPt(mouth, tip, (i + 1) / 5)
    ctx.g.circle(p.x + n.x * Math.sin(ctx.age * 20 + i) * 8 * ctx.unit, p.y + n.y * Math.sin(ctx.age * 20 + i) * 8 * ctx.unit, 2.4 * ctx.unit).fill({ color: 0xffffff, alpha: 0.85 * held })
  }
  if (u >= 1) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.48))
    boom(ctx, ctx.to.x, ctx.to.y, k, hot, 2.15)
    sideWash(ctx, k, hot, 0.85)
    return ctx.to
  }
  return tip
}

function drawDash(ctx: AttackCtx, spec: CinemaSpec, hot: number): Pt {
  const hit = spec.impacts[0] ?? 0.56
  const ang = Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x)
  const n = perpendicular(ctx.from, ctx.to)
  if (ctx.t >= spec.chargeEnd) {
    for (let i = 0; i < 5; i += 1) {
      const back = (i + 1) * 18 * ctx.unit
      const side = (i - 2) * 10 * ctx.unit
      const x = ctx.from.x - Math.cos(ang) * back + n.x * side
      const y = ctx.from.y - Math.sin(ang) * back + n.y * side
      ctx.streak(x, y, 28 * ctx.unit, 2.4 * ctx.unit, ang, i % 2 ? 0xffffff : hot, 0.35 + i * 0.08)
    }
  }
  if (ctx.t >= hit) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.46))
    boom(ctx, ctx.from.x, ctx.from.y, k, hot, 2.2)
    boom(ctx, ctx.to.x, ctx.to.y, k, hot, 1.85)
    sideWash(ctx, k, hot, 0.9)
    return ctx.to
  }
  return ctx.from
}

function drawBarrage(ctx: AttackCtx, spec: CinemaSpec, hot: number): Pt {
  const hit = spec.impacts[0] ?? 0.84
  const n = perpendicular(ctx.from, ctx.to)
  const total = 8
  const step = 0.046
  const lastLaunch = spec.chargeEnd + (total - 1) * step
  const lastTravel = Math.max(0.1, hit - lastLaunch)
  let last = ctx.from
  for (let i = 0; i < total; i += 1) {
    const launch = spec.chargeEnd + i * step
    const travel = lastTravel + (total - 1 - i) * 0.028
    const ang = ctx.age * (4 + i * 0.2) + (i / total) * TAU
    const orbit = 36 * ctx.unit
    const parked = {
      x: ctx.from.x + Math.cos(ang) * orbit,
      y: ctx.from.y + Math.sin(ang) * orbit * 0.72,
    }
    if (ctx.t < launch) {
      const rad = i === total - 1 ? 7 * ctx.unit : 3.4 * ctx.unit
      ctx.g.circle(parked.x, parked.y, rad).fill({ color: i === total - 1 ? 0xffffff : hot, alpha: 0.95 })
      ctx.orb(parked.x, parked.y, rad * 3, hot, 0.35)
      continue
    }
    const u = smooth(Math.min(1, (ctx.t - launch) / travel))
    const side = (i - (total - 1) / 2) * 22 * ctx.unit
    const aim = { x: ctx.to.x + n.x * side * 0.35, y: ctx.to.y + (i - 3) * 8 * ctx.unit }
    const c1 = lerpPt(parked, aim, 0.35)
    const c2 = lerpPt(parked, aim, 0.7)
    c1.x += n.x * side
    c1.y += n.y * side
    const p = cubic(parked, c1, c2, aim, u)
    const big = i === total - 1
    const rad = (big ? 11 : 4.2) * ctx.unit
    ctx.orb(p.x, p.y, rad * (big ? 4 : 2.4), hot, 0.4)
    ctx.g.circle(p.x, p.y, rad).fill({ color: big ? 0xffffff : hot, alpha: 0.95 })
    last = p
    if (u >= 1 && big) {
      const k = smooth(Math.min(1, (ctx.t - hit) / 0.42))
      boom(ctx, aim.x, aim.y, k, hot, 2.25)
    } else if (u >= 1) {
      const arrived = launch + travel
      const k = smooth(Math.min(1, (ctx.t - arrived) / 0.16))
      ctx.g.circle(aim.x, aim.y, (6 + k * 16) * ctx.unit).stroke({ width: 1.6, color: hot, alpha: 1 - k })
    }
  }
  return last
}

function drawLightning(ctx: AttackCtx, spec: CinemaSpec): Pt {
  const hit = spec.impacts[0] ?? 0.82
  const hue = 0xf4fbff
  if (ctx.t < spec.chargeEnd) {
    for (let i = 0; i < 3; i += 1) {
      const a = ctx.seed + i * 2.1 + Math.floor(ctx.age * 12) * 0.4
      const p = { x: ctx.from.x + Math.cos(a) * 46 * ctx.unit, y: ctx.from.y + Math.sin(a) * 28 * ctx.unit }
      stroke(ctx.g, boltAlong(ctx.from, p, ctx.seed + i, 8 * ctx.unit), 2 * ctx.unit, hue, 0.85)
    }
    return ctx.from
  }
  const strikes = 3
  let tip = ctx.from
  for (let i = 0; i < strikes; i += 1) {
    const at = spec.chargeEnd + 0.06 + i * 0.14
    if (ctx.t < at) continue
    const u = smooth(Math.min(1, (ctx.t - at) / 0.07))
    const aim = {
      x: ctx.to.x + (i - 1) * 48 * ctx.unit,
      y: ctx.to.y + (i === 1 ? 0 : 16) * ctx.unit,
    }
    const sky = { x: aim.x + (i - 1) * 10 * ctx.unit, y: skyY(aim.y, (150 + i * 16) * ctx.unit) }
    const end = lerpPt(sky, aim, u)
    const jag = boltAlong(sky, end, ctx.seed + i * 3, 16 * ctx.unit)
    stroke(ctx.glow, jag, 40 * ctx.unit, 0xd7e8ff, 0.95)
    stroke(ctx.g, jag, 16 * ctx.unit, 0x9ec6ff, 1)
    stroke(ctx.g, jag, 5 * ctx.unit, hue, 1)
    tip = end
    if (u >= 1) {
      const k = smooth(Math.min(1, (ctx.t - at) / 0.2))
      ctx.g.circle(aim.x, aim.y, (8 + k * 26) * ctx.unit).stroke({ width: 2, color: hue, alpha: 1 - k })
    }
  }
  if (ctx.t >= hit) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.46))
    boom(ctx, ctx.to.x, ctx.to.y, k, 0xb9d4ff, 2.3)
    sideWash(ctx, k, 0xb9d4ff, 1)
    const core = boltAlong({ x: ctx.to.x, y: skyY(ctx.to.y, 180 * ctx.unit) }, ctx.to, ctx.seed + 9, 20 * ctx.unit)
    stroke(ctx.g, core, (8 * (1 - k)) * ctx.unit, 0xffffff, 1 - k)
    return ctx.to
  }
  return tip
}

function drawInferno(ctx: AttackCtx, spec: CinemaSpec): Pt {
  const hit = spec.impacts[0] ?? 0.7
  const ang = Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x)
  const n = perpendicular(ctx.from, ctx.to)
  if (ctx.t < spec.chargeEnd) {
    for (let i = 0; i < 4; i += 1) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.45 + Math.sin(ctx.age * 8 + i)
      const len = (18 + i * 4) * ctx.unit
      const x = ctx.from.x + Math.cos(a) * (30 * ctx.unit)
      const y = ctx.from.y + Math.sin(a) * (20 * ctx.unit)
      flameTongue(ctx, x, y, a, len, 0.9)
    }
    return ctx.from
  }
  const u = smooth(Math.min(1, (ctx.t - spec.chargeEnd) / Math.max(0.12, hit - spec.chargeEnd)))
  const front = lerpPt(ctx.from, ctx.to, u)
  const height = 70 * ctx.unit
  for (let i = 0; i < 7; i += 1) {
    const along = i / 6
    const base = lerpPt(ctx.from, front, along)
    const flick = Math.sin(ctx.age * 14 + i) * 8 * ctx.unit
    const tip = {
      x: base.x + n.x * flick * 0.2,
      y: base.y - height * (0.45 + (i % 2) * 0.35) + flick,
    }
    flameTongue(ctx, base.x, base.y, Math.atan2(tip.y - base.y, tip.x - base.x), 16 * ctx.unit + along * 28 * ctx.unit, 0.75 + along * 0.25)
  }
  ctx.streak(front.x, front.y, Math.hypot(front.x - ctx.from.x, front.y - ctx.from.y), 22 * ctx.unit, ang, 0xff6a22, 0.35)
  if (u >= 1) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.48))
    boom(ctx, ctx.to.x, ctx.to.y, k, 0xff7a3c, 2.35)
    sideWash(ctx, k, 0xff7a3c, 1.05)
    return ctx.to
  }
  return front
}

function flameTongue(ctx: AttackCtx, x: number, y: number, ang: number, len: number, alpha: number): void {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const tip = { x: x + c * len, y: y + s * len }
  const left = { x: x - s * len * 0.28, y: y + c * len * 0.28 }
  const right = { x: x + s * len * 0.28, y: y - c * len * 0.28 }
  ctx.g.poly([tip.x, tip.y, left.x, left.y, right.x, right.y]).fill({ color: 0xfff1c2, alpha })
  ctx.g.poly([tip.x, tip.y, lerp(left.x, x, 0.4), lerp(left.y, y, 0.4), lerp(right.x, x, 0.4), lerp(right.y, y, 0.4)]).fill({ color: 0xff6a22, alpha: alpha * 0.85 })
}

function drawVortex(ctx: AttackCtx, spec: CinemaSpec, hot: number): Pt {
  const hit = spec.impacts[0] ?? 0.78
  const n = perpendicular(ctx.from, ctx.to)
  const travel = ctx.t < spec.chargeEnd ? 0 : smooth(Math.min(1, (ctx.t - spec.chargeEnd) / Math.max(0.12, hit - spec.chargeEnd)))
  const wobble = Math.sin(ctx.age * 6 + ctx.seed) * 16 * ctx.unit * (1 - travel)
  const base = lerpPt(ctx.from, ctx.to, travel)
  const p = { x: base.x + n.x * wobble, y: base.y + n.y * wobble * 0.3 }
  const spin = ctx.age * 9
  for (let i = 0; i < 7; i += 1) {
    const t = i / 6
    const y = p.y - (58 * ctx.unit) * t
    const rx = (10 + t * 22) * ctx.unit
    const ox = Math.sin(spin + i) * 6 * ctx.unit
    ctx.g.ellipse(p.x + ox, y, rx, rx * 0.38).stroke({ width: 2.6 * ctx.unit, color: i % 2 ? hot : 0xffffff, alpha: 0.8 })
  }
  for (let i = 0; i < 6; i += 1) {
    const a = spin + (i / 6) * TAU
    const rad = (16 + (i % 3) * 8) * ctx.unit
    const dot = { x: p.x + Math.cos(a) * rad, y: p.y + Math.sin(a) * rad * 0.45 }
    ctx.g.circle(dot.x, dot.y, 2.2 * ctx.unit).fill({ color: 0xffffff, alpha: 0.85 })
  }
  if (travel >= 1) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.46))
    if (k < 0.35) {
      ctx.g.ellipse(p.x, p.y, (20 + k * 10) * ctx.unit, 8 * ctx.unit).stroke({ width: 3, color: hot, alpha: 1 - k })
    }
    boom(ctx, ctx.to.x, ctx.to.y, k, hot, 2.15)
    sideWash(ctx, k, hot, 0.95)
    return ctx.to
  }
  return p
}

function drawOrbital(ctx: AttackCtx, spec: CinemaSpec, hot: number): Pt {
  const hit = spec.impacts[0] ?? 0.68
  const up = { x: ctx.from.x, y: skyY(ctx.from.y, 80 * ctx.unit) }
  if (ctx.t < spec.chargeEnd) {
    const h = smooth(ctx.t / spec.chargeEnd)
    stroke(ctx.g, [ctx.from.x, ctx.from.y - 28 * ctx.unit, ctx.from.x, ctx.from.y - (28 + h * 70) * ctx.unit], 3 * ctx.unit, 0xffffff, 0.8)
    ctx.g.circle(up.x, up.y, 4 * ctx.unit).fill({ color: hot, alpha: h })
    return ctx.from
  }
  const lock = smooth(Math.min(1, (ctx.t - spec.chargeEnd) / 0.16))
  const reticle = lerpPt({ x: ctx.to.x - 40 * ctx.unit, y: ctx.to.y }, ctx.to, lock)
  ctx.g.circle(reticle.x, reticle.y, (16 + lock * 10) * ctx.unit).stroke({ width: 2, color: hot, alpha: 0.9 })
  ctx.g.moveTo(reticle.x - 22 * ctx.unit, reticle.y).lineTo(reticle.x + 22 * ctx.unit, reticle.y)
  ctx.g.moveTo(reticle.x, reticle.y - 22 * ctx.unit).lineTo(reticle.x, reticle.y + 22 * ctx.unit)
  ctx.g.stroke({ width: 1.6 * ctx.unit, color: 0xffffff, alpha: 0.85 })
  if (ctx.t < hit - 0.02) return reticle
  const u = smooth(Math.min(1, (ctx.t - (hit - 0.04)) / 0.08))
  const sky = { x: ctx.to.x, y: skyY(ctx.to.y, 200 * ctx.unit) }
  const tip = lerpPt(sky, ctx.to, u)
  ribbon(ctx, sky, tip, 26 * ctx.unit, hot, 0.5)
  ribbon(ctx, sky, tip, 8 * ctx.unit, 0xffffff, 0.95)
  if (u >= 1) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.5))
    boom(ctx, ctx.to.x, ctx.to.y, k, hot, 2.4)
    sideWash(ctx, k, hot, 1)
    ctx.g.ellipse(ctx.to.x, ctx.to.y + 6, (24 + (1 - k) * 20) * ctx.unit, 8 * ctx.unit).fill({ color: hot, alpha: (1 - k) * 0.35 })
    return ctx.to
  }
  return tip
}

function drawBlade(ctx: AttackCtx, spec: CinemaSpec): Pt {
  const hit = spec.impacts[0] ?? 0.6
  const ang = Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x)
  const n = perpendicular(ctx.from, ctx.to)
  const gold = 0xf0c56a
  if (ctx.t < spec.chargeEnd) {
    const grow = smooth(ctx.t / spec.chargeEnd)
    const len = (20 + grow * 36) * ctx.unit
    const hilt = { x: ctx.from.x + n.x * 26 * ctx.unit, y: ctx.from.y + n.y * 26 * ctx.unit }
    const tip = { x: hilt.x + Math.cos(ang) * len, y: hilt.y + Math.sin(ang) * len }
    stroke(ctx.g, [hilt.x, hilt.y, tip.x, tip.y], 4 * ctx.unit, 0xfff6ea, 0.95)
    stroke(ctx.glow, [hilt.x, hilt.y, tip.x, tip.y], 12 * ctx.unit, gold, 0.45)
    return ctx.from
  }
  const u = smooth(Math.min(1, (ctx.t - spec.chargeEnd) / Math.max(0.1, hit - spec.chargeEnd)))
  const sweep = ang - 1.1 + u * 2.2
  const reach = 78 * ctx.unit
  const origin = lerpPt(ctx.from, ctx.to, u * 0.85)
  ctx.g.arc(origin.x, origin.y, reach, sweep - 0.7, sweep + 0.15).stroke({ width: 8 * ctx.unit, color: gold, alpha: 0.9 })
  ctx.g.arc(origin.x, origin.y, reach, sweep - 0.55, sweep).stroke({ width: 2.4 * ctx.unit, color: 0xffffff, alpha: 0.95 })
  if (u >= 1) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.44))
    boom(ctx, ctx.to.x, ctx.to.y, k, gold, 2.05)
    sideWash(ctx, k, gold, 0.9)
    return ctx.to
  }
  return origin
}

function drawDragon(ctx: AttackCtx, spec: CinemaSpec): Pt {
  const hit = spec.impacts[0] ?? 0.72
  const gold = 0xf0c56a
  const n = perpendicular(ctx.from, ctx.to)
  if (ctx.t < spec.chargeEnd) {
    const open = smooth(ctx.t / Math.max(0.08, spec.chargeEnd))
    ctx.g.circle(ctx.from.x, ctx.from.y - 52 * ctx.unit, (12 + open * 18) * ctx.unit).stroke({ width: 2.6, color: gold, alpha: 0.95 })
    ctx.g.circle(ctx.from.x, ctx.from.y - 52 * ctx.unit, (28 + open * 34) * ctx.unit).stroke({ width: 1.6, color: 0xff6a22, alpha: 0.5 * open })
    return ctx.from
  }
  const u = smooth(Math.min(1, (ctx.t - spec.chargeEnd) / Math.max(0.16, hit - spec.chargeEnd)))
  const segments = 14
  let head = ctx.from
  for (let i = 0; i < segments; i += 1) {
    const lag = Math.max(0, u - i * 0.026)
    const wave = Math.sin(lag * 8 + ctx.age * 7) * 48 * ctx.unit * (1 - i / segments)
    const base = lerpPt(ctx.from, ctx.to, lag)
    const p = { x: base.x + n.x * wave, y: base.y + n.y * wave * 0.5 }
    const rad = (i === 0 ? 30 : 20 - i * 0.85) * ctx.unit
    ctx.orb(p.x, p.y, Math.max(8, rad) * 3.4, 0xff4a12, 0.46)
    ctx.g.circle(p.x, p.y, Math.max(5, rad)).fill({ color: i === 0 ? 0xfff6ea : gold, alpha: 0.94 })
    if (i === 0) {
      head = p
      const wing = 62 * ctx.unit
      ctx.g.poly([
        p.x, p.y,
        p.x + n.x * wing, p.y + n.y * wing - 22 * ctx.unit,
        p.x + n.x * wing * 0.32, p.y + n.y * wing * 0.18,
      ]).fill({ color: 0xff7a3c, alpha: 0.78 })
      ctx.g.poly([
        p.x, p.y,
        p.x - n.x * wing, p.y - n.y * wing - 22 * ctx.unit,
        p.x - n.x * wing * 0.32, p.y - n.y * wing * 0.18,
      ]).fill({ color: 0xffb15a, alpha: 0.68 })
    }
  }
  if (u >= 1) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.62))
    boom(ctx, ctx.to.x, ctx.to.y, k, 0xff7a3c, 3.2)
    sideWash(ctx, k, 0xff6a22, 1.45)
    return ctx.to
  }
  return head
}

function drawMeteor(ctx: AttackCtx, spec: CinemaSpec): Pt {
  const hit = spec.impacts[0] ?? 0.66
  const open = smooth(Math.min(1, ctx.t / 0.22))
  ctx.g.circle(ctx.from.x, ctx.from.y, (48 + open * 16) * ctx.unit).stroke({ width: 2.6, color: 0xc7b6ff, alpha: 0.78 })
  ctx.g.circle(ctx.from.x, ctx.from.y, (70 + open * 22) * ctx.unit).stroke({ width: 1.4, color: 0xffe0b0, alpha: 0.35 * open })
  if (ctx.t < 0.18) return ctx.from
  const markerU = smooth(Math.min(1, (ctx.t - 0.12) / 0.16))
  const mark = lerpPt(ctx.from, ctx.to, markerU)
  ctx.g.circle(mark.x, mark.y, 6 * ctx.unit).fill({ color: 0xfff6ea, alpha: 0.95 })
  if (markerU >= 1) {
    ctx.g.circle(ctx.to.x, ctx.to.y, (22 + open * 28) * ctx.unit).stroke({ width: 3, color: 0xffe0b0, alpha: 0.9 })
    ctx.g.circle(ctx.to.x, ctx.to.y, (40 + open * 36) * ctx.unit).stroke({ width: 1.6, color: 0xff7a3c, alpha: 0.45 })
  }
  if (ctx.t < spec.chargeEnd + 0.06) return mark
  const u = smooth(Math.min(1, (ctx.t - spec.chargeEnd) / Math.max(0.14, hit - spec.chargeEnd)))
  const sky = { x: ctx.to.x - 48 * ctx.unit, y: skyY(ctx.to.y, 320 * ctx.unit) }
  const p = lerpPt(sky, ctx.to, u * u)
  const ang = Math.atan2(ctx.to.y - sky.y, ctx.to.x - sky.x)
  ctx.streak(p.x, p.y, 280 * ctx.unit, 46 * ctx.unit, ang, 0xff6a22, 0.82)
  ctx.streak(p.x, p.y, 160 * ctx.unit, 18 * ctx.unit, ang, 0xfff6ea, 0.55)
  ctx.orb(p.x, p.y, 70 * ctx.unit, 0xff4a12, 0.4)
  ctx.g.circle(p.x, p.y, 36 * ctx.unit).fill({ color: 0xffb15a, alpha: 0.96 })
  ctx.g.circle(p.x, p.y, 14 * ctx.unit).fill({ color: 0xfff6ea, alpha: 1 })
  if (u >= 1) {
    const k = smooth(Math.min(1, (ctx.t - hit) / 0.68))
    boom(ctx, ctx.to.x, ctx.to.y, k, 0xff7a3c, 3.45)
    sideWash(ctx, k, 0xffb15a, 1.6)
    ctx.g.ellipse(ctx.to.x, ctx.to.y + 6, (36 + (1 - k) * 28) * ctx.unit, 12 * ctx.unit).fill({ color: 0xffe0b0, alpha: (1 - k) * 0.6 })
    return ctx.to
  }
  return p
}

function drawBlackHole(ctx: AttackCtx, spec: CinemaSpec, hot: number): Pt {
  const hit = spec.impacts[0] ?? 0.8
  const ang = Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x)
  const mouth = { x: ctx.from.x + Math.cos(ang) * 40 * ctx.unit, y: ctx.from.y + Math.sin(ang) * 40 * ctx.unit }
  if (ctx.t < spec.chargeEnd) {
    for (let i = 0; i < 10; i += 1) {
      const a = ctx.seed + i + ctx.age
      ctx.g.circle(ctx.from.x + Math.cos(a) * (52 + (i % 4) * 12) * ctx.unit, ctx.from.y + Math.sin(a * 1.3) * 30 * ctx.unit, 2.2 * ctx.unit).fill({ color: 0xfff6ea, alpha: 0.92 })
    }
    ctx.g.circle(mouth.x, mouth.y, 9 * ctx.unit).fill({ color: 0x07060e, alpha: 0.96 })
    ctx.g.circle(mouth.x, mouth.y, 14 * ctx.unit).stroke({ width: 2.2, color: hot, alpha: 0.85 })
    return mouth
  }
  const flyEnd = spec.chargeEnd + 0.16
  const hold = lerp(flyEnd, hit - 0.08, 0.5)
  let center = ctx.to
  if (ctx.t < flyEnd) {
    const u = smooth((ctx.t - spec.chargeEnd) / 0.16)
    center = lerpPt(mouth, ctx.to, u)
  }
  const grow = ctx.t < flyEnd ? 0.35 : smooth(Math.min(1, (ctx.t - flyEnd) / Math.max(0.12, hold - flyEnd)))
  const rad = (14 + grow * 52) * ctx.unit
  if (ctx.t < hit) {
    ctx.orb(center.x, center.y, rad * 2.8, hot, 0.28)
    ctx.g.circle(center.x, center.y, rad).fill({ color: 0x05040a, alpha: 0.94 })
    ctx.g.circle(center.x, center.y, rad + 7 * ctx.unit).stroke({ width: 3, color: hot, alpha: 0.9 })
    ctx.g.circle(center.x, center.y, rad + 18 * ctx.unit).stroke({ width: 1.4, color: 0xffffff, alpha: 0.45 })
    for (let i = 0; i < 14; i += 1) {
      const a = ctx.age * 2.4 + (i / 14) * TAU
      const far = rad + (48 + (i % 4) * 18) * ctx.unit
      stroke(ctx.g, [center.x + Math.cos(a) * far, center.y + Math.sin(a) * far, center.x + Math.cos(a) * rad, center.y + Math.sin(a) * rad], 2.2 * ctx.unit, i % 2 ? 0xffffff : hot, 0.62)
    }
    return center
  }
  const k = smooth(Math.min(1, (ctx.t - hit) / 0.72))
  if (k < 0.16) {
    ctx.g.circle(ctx.to.x, ctx.to.y, 150 * ctx.unit).fill({ color: 0x05040a, alpha: 0.62 * (1 - k / 0.16) })
  }
  for (let i = 0; i < 4; i += 1) {
    const ring = smooth(Math.min(1, Math.max(0, (k - i * 0.07) / 0.72)))
    ctx.g.circle(ctx.to.x, ctx.to.y, (18 + ring * (110 + i * 42)) * ctx.unit).stroke({ width: (5 - i) * ctx.unit, color: i === 1 ? 0xffffff : hot, alpha: 1 - ring })
  }
  boom(ctx, ctx.to.x, ctx.to.y, k, 0xc7b6ff, 3.6)
  sideWash(ctx, k, hot, 1.7)
  return ctx.to
}

function boltAlong(from: Pt, to: Pt, seed: number, jag: number): number[] {
  const pts = [from.x, from.y]
  const steps = 6
  const n = perpendicular(from, to)
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    const p = lerpPt(from, to, t)
    const side = i === steps ? 0 : Math.sin(seed * 2 + i * 2.2) * jag
    pts.push(p.x + n.x * side, p.y + n.y * side)
  }
  return pts
}
