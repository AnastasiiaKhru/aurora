import type { Graphics } from 'pixi.js'
import { perpendicular, type Pt } from './motion.ts'
import type { BlasterCtx } from './blaster.ts'

export type LiveId =
  | 'like'
  | 'follow'
  | 'share'
  | 'comment'
  | 'heart'
  | 'hearts'
  | 'rose'
  | 'rosa'
  | 'tiktok'
  | 'gg'
  | 'ice'
  | 'perfume'
  | 'doughnut'
  | 'confetti'
  | 'aura'
  | 'shades'
  | 'thunder'
  | 'blaze'
  | 'money'
  | 'train'
  | 'galaxy'
  | 'wind'
  | 'prism'
  | 'storm'
  | 'inferno'
  | 'sabre'
  | 'lion'
  | 'universe'
  | 'tiktok-universe'

const GIFT_TRAVEL: Partial<Record<LiveId, number>> = {
  heart: 0.34,
  hearts: 0.48,
  rose: 0.42,
  rosa: 0.52,
  tiktok: 0.4,
  gg: 0.36,
  ice: 0.44,
  perfume: 0.58,
  doughnut: 0.62,
  confetti: 0.85,
  aura: 0.95,
  shades: 1.05,
  thunder: 0.8,
  blaze: 0.95,
  money: 1.7,
  train: 1.9,
  galaxy: 2.15,
  wind: 2.05,
  prism: 2.25,
  storm: 2.7,
  inferno: 3,
  sabre: 2.85,
  lion: 3.6,
  universe: 4.4,
  'tiktok-universe': 4,
}

/** Real seconds until the hit. Likes stay instant. Gift shots stay long enough to read. Damage amount is unchanged. */
export function quickTravel(name: string | undefined): number | null {
  const id = liveId(name)
  if (!id) return null
  if (id === 'like' || id === 'comment') return 0.16
  if (id === 'follow') return 0.26
  if (id === 'share') return 0.36
  return GIFT_TRAVEL[id] ?? null
}

export function isCatalogGift(name: string | undefined): boolean {
  const id = liveId(name)
  return !!id && id !== 'like' && id !== 'follow' && id !== 'share' && id !== 'comment'
}

export function liveId(name: string | undefined): LiveId | null {
  const n = (name ?? '').trim().toLowerCase()
  if (!n) return null
  if (n === 'like' || n.endsWith(' likes')) return 'like'
  if (n === 'follow') return 'follow'
  if (n === 'share') return 'share'
  if (n === 'comment') return 'comment'
  if (n.includes('tiktok universe')) return 'tiktok-universe'
  if (n === 'universe') return 'universe'
  if (n.includes('hand heart')) return 'hearts'
  if (n.includes('finger heart') || n === 'heart') return 'heart'
  if (n === 'rosa') return 'rosa'
  if (n === 'rose') return 'rose'
  if (n === 'tiktok') return 'tiktok'
  if (n === 'gg') return 'gg'
  if (n.includes('ice cream')) return 'ice'
  if (n === 'perfume') return 'perfume'
  if (n === 'doughnut') return 'doughnut'
  if (n === 'confetti') return 'confetti'
  if (n.includes('aura')) return 'aura'
  if (n.includes('sunglass')) return 'shades'
  if (n.includes('thunderstorm') || n === 'storm') return 'storm'
  if (n === 'thunder') return 'thunder'
  if (n === 'blaze') return 'blaze'
  if (n.includes('money')) return 'money'
  if (n === 'train') return 'train'
  if (n === 'galaxy') return 'galaxy'
  if (n.includes('whirlwind')) return 'wind'
  if (n.includes('prism')) return 'prism'
  if (n === 'inferno') return 'inferno'
  if (n.includes('sabre') || n.includes('saber')) return 'sabre'
  if (n === 'lion') return 'lion'
  return null
}

export function drawLiveLook(ctx: BlasterCtx): boolean {
  if (isAutoBasic(ctx.command)) {
    const s = Math.max(0.9, ctx.scale)
    const step = move(ctx)
    const team = ctx.command.team === 'blue' ? 0x3ec6ff : 0xff3b5c
    autoDart(ctx, step, s, team)
    return true
  }
  const id = liveId(ctx.command.giftName)
  if (!id) return false
  const gift = isCatalogGift(ctx.command.giftName)
  const s = Math.max(gift ? 1.2 : 0.45, ctx.scale) * (gift ? 1.7 : 1)
  const step = move(ctx)
  const team = ctx.command.team === 'blue' ? 0x3ec6ff : 0xff3b5c
  switch (id) {
    case 'like':
      needle(ctx, step, s, team)
      break
    case 'follow':
      lock(ctx, step, s)
      break
    case 'share':
      shareDart(ctx, step, s)
      break
    case 'comment':
      tick(ctx, step, s, team)
      break
    case 'heart':
      hearts(ctx, step, s, 1)
      break
    case 'hearts':
      hearts(ctx, step, s, 3)
      break
    case 'rose':
      thorns(ctx, step, s, 1, 0xff2d55)
      break
    case 'rosa':
      thorns(ctx, step, s, 3, 0xff1a3c)
      break
    case 'tiktok':
      glitch(ctx, step, s)
      break
    case 'gg':
      squareStop(ctx, step, s)
      break
    case 'ice':
      slash(ctx, step, s, 0x9ee7ff)
      break
    case 'perfume':
      mist(ctx, step, s)
      break
    case 'doughnut':
      ringPass(ctx, step, s)
      break
    case 'confetti':
      bars(ctx, step, s)
      break
    case 'aura':
      column(ctx, step, s)
      break
    case 'shades':
      flare(ctx, step, s)
      break
    case 'thunder':
      skyBolt(ctx, step, s, 1)
      break
    case 'storm':
      skyBolt(ctx, step, s, 3)
      break
    case 'blaze':
      wedge(ctx, step, s)
      break
    case 'money':
      bills(ctx, step, s)
      break
    case 'train':
      windows(ctx, step, s)
      break
    case 'galaxy':
      orbit(ctx, step, s)
      break
    case 'wind':
      ribbon(ctx, step, s)
      break
    case 'prism':
      strands(ctx, step, s)
      break
    case 'inferno':
      climb(ctx, step, s)
      break
    case 'sabre':
      crescent(ctx, step, s)
      break
    case 'lion':
      mane(ctx, step, s)
      break
    case 'universe':
      ringGrow(ctx, step, s, false)
      break
    case 'tiktok-universe':
      ringGrow(ctx, step, s, true)
      break
    default:
      return false
  }
  if (gift && id !== 'rose') bombDrop(ctx, step, id)
  return true
}

interface Step {
  u: number
  k: number
  head: Pt
  ang: number
}

function move(ctx: BlasterCtx): Step {
  const marks = ctx.command.impacts.length > 0 ? ctx.command.impacts : [0.75]
  const flight = Math.max(0.08, marks[0] ?? 0.75)
  const raw = clamp(ctx.t / flight, 0, 1.6)
  const u = Math.min(1, raw)
  const k = raw <= 1 ? 0 : clamp((raw - 1) / 0.45, 0, 1)
  const aim = edge(ctx.from, ctx.to)
  const head = lerp(ctx.from, aim, u)
  const ang = Math.atan2(aim.y - ctx.from.y, aim.x - ctx.from.x)
  return { u, k, head, ang }
}

export function isAutoBasic(command: { ambient?: boolean; giftName?: string; rarity?: string }): boolean {
  if (!command.ambient) return false
  if ((command.giftName ?? '').trim().toLowerCase() !== 'tiktok') return false
  return command.rarity !== 'large' && command.rarity !== 'legendary' && command.rarity !== 'medium'
}

function dash(ctx: BlasterCtx, tail: Pt, head: Pt, color: number, glowW: number, coreW: number): void {
  line(ctx.glow, tail, head, glowW, color, 0.55)
  line(ctx.g, tail, head, coreW, 0xffffff, 1)
}

function autoDart(ctx: BlasterCtx, step: Step, _s: number, color: number): void {
  const tail = behind(ctx.from, ctx.to, step.head, 34)
  dash(ctx, tail, step.head, color, 6, 2.2)
}

function needle(ctx: BlasterCtx, step: Step, _s: number, color: number): void {
  const tail = behind(ctx.from, ctx.to, step.head, 48)
  dash(ctx, tail, step.head, color, 8, 2.8)
}

function lock(ctx: BlasterCtx, step: Step, s: number): void {
  const color = 0x3dffb0
  const p = lerp(ctx.from, ctx.to, step.u)
  line(ctx.g, ctx.from, p, 2.2 * s, color, 0.9)
  ctx.g.circle(ctx.to.x, ctx.to.y, (10 + step.u * 16) * s).stroke({ width: 2.4 * s, color, alpha: 1 - step.k })
  ctx.g.circle(p.x, p.y, 4 * s).fill({ color: 0xffffff, alpha: 1 })
  if (step.k > 0) pop(ctx, ctx.to, step.k, color, 22 * s)
}

function shareDart(ctx: BlasterCtx, step: Step, s: number): void {
  const color = 0xc58bff
  const top = Math.min(ctx.from.y, ctx.to.y) - 90 * s
  const up = { x: ctx.from.x, y: top }
  const drop = { x: ctx.to.x, y: top }
  const p = step.u < 0.5 ? lerp(ctx.from, up, step.u / 0.5) : lerp(drop, ctx.to, (step.u - 0.5) / 0.5)
  blast(ctx, p, s, color, 12)
  if (step.k > 0) pop(ctx, ctx.to, step.k, color, 20 * s)
}

function tick(ctx: BlasterCtx, step: Step, s: number, color: number): void {
  const n = perpendicular(ctx.from, ctx.to)
  const a = { x: step.head.x + n.x * 16 * s, y: step.head.y + n.y * 16 * s }
  const b = { x: step.head.x - n.x * 16 * s, y: step.head.y - n.y * 16 * s }
  line(ctx.g, a, b, 4 * s, color, 1)
  line(ctx.g, a, b, 1.4 * s, 0xffffff, 1)
  if (step.k > 0) pop(ctx, ctx.to, step.k, color, 16 * s)
}

function hearts(ctx: BlasterCtx, step: Step, _s: number, count: number): void {
  const n = perpendicular(ctx.from, ctx.to)
  const color = 0xff4d88
  const size = count === 1 ? 28 : 20
  for (let i = 0; i < count; i += 1) {
    const side = (i - (count - 1) / 2) * 40
    const head = { x: step.head.x + n.x * side, y: step.head.y + n.y * side }
    for (let trail = 3; trail >= 1; trail -= 1) {
      const back = behind(ctx.from, ctx.to, head, trail * 26)
      heart(ctx.g, back.x, back.y, size * (0.72 - trail * 0.12), color, 0.28 / trail, step.ang)
    }
    ctx.glow.circle(head.x, head.y, size * 2.1).fill({ color, alpha: 0.5 })
    heart(ctx.g, head.x, head.y, size, color, 1, step.ang)
    heart(ctx.g, head.x, head.y, size * 0.38, 0xfff6ea, 0.9, step.ang)
  }
  if (step.u > 0.7) {
    ctx.glow.circle(ctx.to.x, ctx.to.y, RIM + 16).stroke({ width: 14, color, alpha: 0.35 * (1 - step.k) })
    ctx.g.circle(ctx.to.x, ctx.to.y, RIM + 10).stroke({ width: 2, color: 0xfff6ea, alpha: 0.85 * (1 - step.k) })
  }
}

function thorns(ctx: BlasterCtx, step: Step, s: number, count: number, color: number): void {
  const n = perpendicular(ctx.from, ctx.to)
  for (let i = 0; i < count; i += 1) {
    const side = (i - (count - 1) / 2) * 22 * s
    const start = { x: ctx.from.x + n.x * side, y: ctx.from.y + n.y * side }
    const tip = { x: step.head.x + n.x * side, y: step.head.y + n.y * side }
    line(ctx.glow, start, tip, 8, color, 0.45)
    line(ctx.g, start, tip, 2.4, 0xfff6ea, 1)
  }
  if (step.u > 0.8) bloom(ctx.g, step.head.x, step.head.y, 18, color, 1 - step.k * 0.2)
  if (count > 1 && step.u > 0.62) {
    for (let i = 0; i < count; i += 1) {
      const side = (i - (count - 1) / 2) * 22 * s
      const tip = { x: step.head.x + n.x * side, y: step.head.y + n.y * side }
      bloom(ctx.g, tip.x, tip.y, 11, color, 0.9)
      ctx.glow.circle(tip.x, tip.y, 16).fill({ color, alpha: 0.4 })
    }
  }
}

function glitch(ctx: BlasterCtx, step: Step, _s: number): void {
  const split = step.u < 0.62 ? step.u / 0.62 : 1 - (step.u - 0.62) / 0.38
  const kick = split * 42
  const radius = RIM + 14
  ctx.glow.circle(ctx.to.x - kick, ctx.to.y, radius + 10).stroke({ width: 16, color: 0x22e7ff, alpha: 0.45 })
  ctx.glow.circle(ctx.to.x + kick, ctx.to.y, radius + 10).stroke({ width: 16, color: 0xff2d8a, alpha: 0.45 })
  ctx.g.circle(ctx.to.x - kick, ctx.to.y, radius).stroke({ width: 3.5, color: 0x22e7ff, alpha: 1 })
  ctx.g.circle(ctx.to.x + kick, ctx.to.y, radius).stroke({ width: 3.5, color: 0xff2d8a, alpha: 1 })
  ctx.g.circle(ctx.to.x - kick, ctx.to.y, radius - 8).stroke({ width: 1.2, color: 0xffffff, alpha: 0.7 })
  ctx.g.circle(ctx.to.x + kick, ctx.to.y, radius - 8).stroke({ width: 1.2, color: 0xffffff, alpha: 0.7 })
  for (let i = 0; i < 4; i += 1) {
    const y = ctx.to.y - radius - 14 + i * 7
    const slide = Math.sin(ctx.age * 9 + i) * 18
    ctx.g.rect(ctx.to.x - kick - 20 + slide, y, 26, 3).fill({ color: 0x22e7ff, alpha: 0.9 })
    ctx.g.rect(ctx.to.x + kick - 6 - slide, y, 26, 3).fill({ color: 0xff2d8a, alpha: 0.9 })
  }
  if (split < 0.22) ctx.glow.circle(ctx.to.x, ctx.to.y, radius + 6).stroke({ width: 10, color: 0xffffff, alpha: 0.55 })
}

function squareStop(ctx: BlasterCtx, step: Step, _s: number): void {
  const grow = RIM + 8 + step.u * 56
  ctx.glow.rect(ctx.to.x - grow - 12, ctx.to.y - grow - 12, grow * 2 + 24, grow * 2 + 24).stroke({ width: 18, color: 0xb8fff2, alpha: 0.32 })
  ctx.g.rect(ctx.to.x - grow, ctx.to.y - grow, grow * 2, grow * 2).stroke({ width: 3.2, color: 0xffffff, alpha: 1 })
  ctx.g.rect(ctx.to.x - grow + 10, ctx.to.y - grow + 10, grow * 2 - 20, grow * 2 - 20).stroke({ width: 1.4, color: 0xb8fff2, alpha: 0.85 })
  const arm = 22 + step.u * 10
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  for (const [sx, sy] of corners) {
    const x = ctx.to.x + sx * grow
    const y = ctx.to.y + sy * grow
    line(ctx.g, { x, y }, { x: x - sx * arm, y }, 3, 0xffffff, 1)
    line(ctx.g, { x, y }, { x, y: y - sy * arm }, 3, 0xb8fff2, 1)
  }
}

function slash(ctx: BlasterCtx, step: Step, s: number, color: number): void {
  const aim = edge(ctx.from, ctx.to)
  const n = perpendicular(ctx.from, ctx.to)
  const reach = 34 * Math.min(s, 1.4)
  const a = { x: aim.x - n.x * reach, y: aim.y - n.y * reach }
  const b = { x: aim.x + n.x * reach * step.u, y: aim.y + n.y * reach * step.u }
  line(ctx.glow, a, b, 14, color, 0.4)
  line(ctx.g, a, b, 3.2, 0xffffff, 1)
  ctx.g.circle(b.x, b.y, 6).fill({ color: 0xf4fbff, alpha: 1 })
  ctx.glow.circle(b.x, b.y, 16).fill({ color, alpha: 0.45 })
  for (let i = 0; i < 5; i += 1) {
    const along = lerp(a, b, 0.2 + i * 0.16)
    const lift = (i % 2 === 0 ? 1 : -1) * (10 + i * 3)
    const chip = { x: along.x + n.x * lift, y: along.y + n.y * lift }
    ctx.g.poly([chip.x, chip.y - 7, chip.x + 5, chip.y + 4, chip.x - 5, chip.y + 3]).fill({ color: 0xe8fbff, alpha: 0.9 })
  }
  ctx.glow.circle(ctx.to.x, ctx.to.y, RIM + 14).stroke({ width: 12, color, alpha: 0.35 * (1 - step.k) })
  ctx.g.circle(ctx.to.x, ctx.to.y, RIM + 8).stroke({ width: 1.8, color, alpha: 0.8 * (1 - step.k) })
}

function mist(ctx: BlasterCtx, step: Step, _s: number): void {
  const aim = edge(ctx.from, ctx.to)
  const p = lerp(ctx.from, aim, step.u)
  ctx.glow.ellipse(p.x, p.y, 110, 58).fill({ color: 0xd7a6ff, alpha: 0.4 })
  ctx.g.ellipse(p.x, p.y, 64, 32).fill({ color: 0xefd4ff, alpha: 0.28 })
  ctx.g.ellipse(p.x - 18, p.y - 8, 28, 16).fill({ color: 0xfff6ea, alpha: 0.35 })
  for (let i = 0; i < 8; i += 1) {
    const a = ctx.age * 1.4 + i
    const r = 24 + (i % 4) * 14
    ctx.g.circle(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.55, 2.4).fill({ color: 0xfff6ea, alpha: 0.85 })
  }
  ctx.glow.circle(ctx.to.x, ctx.to.y, RIM + 22).stroke({ width: 20, color: 0xe7c6ff, alpha: 0.4 * step.u })
  ctx.g.circle(ctx.to.x, ctx.to.y, RIM + 14).stroke({ width: 2.6, color: 0xf6e4ff, alpha: 0.95 * step.u })
}

function ringPass(ctx: BlasterCtx, step: Step, _s: number): void {
  const travel = Math.min(1, step.u / 0.7)
  const p = lerp(ctx.from, ctx.to, travel)
  const radius = 86 - travel * (86 - (RIM + 16))
  ctx.glow.circle(p.x, p.y, radius).stroke({ width: 26, color: 0xff8fb8, alpha: 0.42 })
  ctx.g.circle(p.x, p.y, radius).stroke({ width: 16, color: 0xff8fb8, alpha: 1 })
  ctx.g.circle(p.x, p.y, radius).stroke({ width: 3.2, color: 0xfff6ea, alpha: 0.95 })
  ctx.g.arc(p.x, p.y, radius, -2.4, -0.4).stroke({ width: 5, color: 0xfff6ea, alpha: 0.85 })
  for (let i = 0; i < 10; i += 1) {
    const a = ctx.age * 2 + (i / 10) * Math.PI * 2
    const sprinkle = [0xff5b8a, 0xffd15c, 0x7ee7ff, 0xffffff][i % 4] ?? 0xffffff
    ctx.g.circle(p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius, 3.4).fill({ color: sprinkle, alpha: 1 })
  }
}

function bars(ctx: BlasterCtx, step: Step, _s: number): void {
  const box = sideBox(ctx)
  const colors = [0xff5b8a, 0xffd15c, 0x7ee7ff, 0xd7a6ff, 0xffffff]
  const span = Math.max(40, box.bottom - box.top)
  for (let i = 0; i < colors.length; i += 1) {
    const band = span / colors.length
    const y = box.top + i * band
    const wide = (box.x1 - box.x0) * clamp(step.u * 1.25 - i * 0.06, 0, 1)
    ctx.glow.rect(box.x0, y + band * 0.34, wide, Math.max(8, band * 0.28)).fill({ color: colors[i]!, alpha: 0.35 })
    ctx.g.rect(box.x0, y + band * 0.4, wide, Math.max(4, band * 0.12)).fill({ color: colors[i]!, alpha: 0.9 * (1 - step.k * 0.4) })
  }
  for (let i = 0; i < 26; i += 1) {
    const color = colors[i % colors.length]!
    const col = (i * 5 + 2) % 8
    const x = box.x0 + ((col + 0.5) / 8) * (box.x1 - box.x0)
    const fall = (step.u * 1.15 + i * 0.06) % 1
    const y = box.top + fall * span
    const s = 5 + (i % 3) * 3
    ctx.glow.circle(x, y, s * 1.6).fill({ color, alpha: 0.35 })
    ctx.g.poly([x, y - s, x + s * 0.55, y, x, y + s, x - s * 0.55, y]).fill({ color, alpha: 0.95 })
  }
}

function column(ctx: BlasterCtx, step: Step, _s: number): void {
  const box = sideBox(ctx)
  const lip = ctx.to.y - RIM
  const y = box.top + (lip - box.top) * step.u
  const h = Math.max(8, lip - y)
  const w = 70
  ctx.glow.rect(ctx.to.x - w * 0.95, y, w * 1.9, h).fill({ color: 0xffd0ea, alpha: 0.28 })
  ctx.g.rect(ctx.to.x - w * 0.5, y, w, h).fill({ color: 0xff8ec8, alpha: 0.35 })
  ctx.g.rect(ctx.to.x - w * 0.22, y, w * 0.44, h).fill({ color: 0xfff6ea, alpha: 0.72 })
  ctx.g.rect(ctx.to.x - 4, y, 8, h).fill({ color: 0xffffff, alpha: 1 })
  ctx.glow.circle(ctx.to.x, lip, 28).fill({ color: 0xffd0ea, alpha: 0.45 * step.u })
  for (let i = 0; i < 8; i += 1) {
    const t = (step.u * 1.4 + i * 0.12) % 1
    const py = lip - t * h
    const px = ctx.to.x + Math.sin(i * 2.1 + ctx.age * 4) * 22
    ctx.g.circle(px, py, 3).fill({ color: 0xffffff, alpha: 0.9 })
  }
}

function flare(ctx: BlasterCtx, step: Step, _s: number): void {
  const box = sideBox(ctx)
  const y = box.top + (Math.max(box.top + 20, ctx.to.y) - box.top) * step.u
  ctx.glow.rect(box.x0, y - 22, box.x1 - box.x0, 44).fill({ color: 0xffe7a8, alpha: 0.34 })
  ctx.g.rect(box.x0, y - 3, box.x1 - box.x0, 6).fill({ color: 0xf0c56a, alpha: 1 })
  ctx.g.rect(box.x0, y - 1, box.x1 - box.x0, 2).fill({ color: 0xffffff, alpha: 0.95 })
  for (let i = 0; i < 5; i += 1) {
    const x = box.x0 + ((i + 0.5) / 5) * (box.x1 - box.x0)
    const arm = 10 + (i % 2) * 6
    line(ctx.g, { x: x - arm, y }, { x: x + arm, y }, 1.6, 0xfff6ea, 0.9)
    line(ctx.g, { x, y: y - arm }, { x, y: y + arm }, 1.6, 0xfff6ea, 0.9)
    ctx.g.circle(x, y, 3).fill({ color: 0xffffff, alpha: 1 })
  }
}

function skyBolt(ctx: BlasterCtx, step: Step, _s: number, count: number): void {
  const box = sideBox(ctx)
  for (let i = 0; i < count; i += 1) {
    const start = i / count
    const local = clamp((step.u - start * 0.42) / 0.5, 0, 1)
    if (local <= 0) continue
    const span = box.x1 - box.x0
    const x = box.x0 + span * ((i + 1) / (count + 1))
    ctx.glow.rect(x - 10, box.top, 20, Math.max(8, (ctx.to.y - RIM - box.top) * local)).fill({ color: 0xfff4c4, alpha: 0.22 })
    jag(ctx.g, x, box.top, ctx.to.y - RIM, local, 3.4, 0xfff6d0, i + 1)
    jag(ctx.glow, x, box.top, ctx.to.y - RIM, local, 14, 0xffe7a0, i + 3)
    const endY = box.top + (ctx.to.y - RIM - box.top) * local
    ctx.glow.circle(x, endY, 18).fill({ color: 0xfff4c4, alpha: 0.45 })
    ctx.g.circle(x, endY, 4).fill({ color: 0xffffff, alpha: 1 })
    if (local > 0.35) {
      line(ctx.g, { x, y: endY - 24 }, { x: x + 16, y: endY - 8 }, 1.6, 0xfff6ea, 0.8)
      line(ctx.g, { x, y: endY - 24 }, { x: x - 14, y: endY - 6 }, 1.6, 0xfff6ea, 0.8)
    }
  }
}

function wedge(ctx: BlasterCtx, step: Step, _s: number): void {
  const n = perpendicular(ctx.from, ctx.to)
  const wide = 120
  const tip = step.head
  const left = { x: ctx.from.x + n.x * wide, y: ctx.from.y + n.y * wide }
  const right = { x: ctx.from.x - n.x * wide, y: ctx.from.y - n.y * wide }
  ctx.glow.poly([left.x, left.y, right.x, right.y, tip.x, tip.y]).fill({ color: 0xff4a12, alpha: 0.4 })
  ctx.g.poly([left.x, left.y, right.x, right.y, tip.x, tip.y]).fill({ color: 0xff6a1a, alpha: 0.94 })
  ctx.g.poly([
    ctx.from.x + n.x * wide * 0.32,
    ctx.from.y + n.y * wide * 0.32,
    ctx.from.x - n.x * wide * 0.32,
    ctx.from.y - n.y * wide * 0.32,
    tip.x,
    tip.y,
  ]).fill({ color: 0xffe08a, alpha: 0.95 })
  for (let i = 0; i < 7; i += 1) {
    const t = clamp(step.u * 1.1 - i * 0.08, 0, 1)
    const p = lerp(ctx.from, tip, t)
    const drift = Math.sin(ctx.age * 6 + i) * 16
    ctx.glow.circle(p.x + n.x * drift, p.y + n.y * drift, 10).fill({ color: 0xffe08a, alpha: 0.4 })
    ctx.g.circle(p.x + n.x * drift, p.y + n.y * drift, 3.2).fill({ color: 0xfff6ea, alpha: 0.95 })
  }
}

function bills(ctx: BlasterCtx, step: Step, _s: number): void {
  const n = perpendicular(ctx.from, ctx.to)
  for (let i = 0; i < 12; i += 1) {
    const u = clamp(step.u * 1.2 - i * 0.04, 0, 1)
    if (u <= 0) continue
    const aim = edge(ctx.from, ctx.to)
    const p = lerp(ctx.from, aim, u)
    const burn = u > 0.62 ? (u - 0.62) / 0.38 : 0
    const side = (i - 5.5) * 11
    const w = 22 * (1 - burn * 0.4)
    const h = 12 * (1 - burn * 0.4)
    ctx.g.roundRect(p.x + n.x * side - w / 2, p.y + n.y * side - h / 2, w, h, 3).fill({
      color: burn > 0.35 ? 0xff5a1a : 0x7dff6a,
      alpha: 0.96,
    })
    ctx.glow.circle(p.x + n.x * side, p.y + n.y * side, 14).fill({ color: burn > 0.35 ? 0xff5a1a : 0x7dff6a, alpha: 0.28 })
  }
  if (step.u > 0.2) {
    const aim = edge(ctx.from, ctx.to)
    const coin = lerp(ctx.from, aim, Math.min(1, step.u))
    ctx.g.circle(coin.x, coin.y - 18, 7).fill({ color: 0xf0c56a, alpha: 1 })
    ctx.g.circle(coin.x + 16, coin.y + 8, 5).fill({ color: 0xfff6ea, alpha: 0.9 })
  }
}

function windows(ctx: BlasterCtx, step: Step, _s: number): void {
  const box = sideBox(ctx)
  const y = ctx.to.y - RIM
  const nose = box.x0 + (box.x1 - box.x0) * Math.max(0.08, step.u)
  line(ctx.g, { x: box.x0, y }, { x: nose, y }, 7, 0x241c12, 0.92)
  line(ctx.glow, { x: box.x0, y }, { x: nose, y }, 22, 0xffe08a, 0.45)
  for (let i = 0; i < 10; i += 1) {
    const px = box.x0 + ((nose - box.x0) * (i + 0.5)) / 10
    ctx.g.rect(px - 6, y - 9, 12, 18).fill({ color: 0xfff6c8, alpha: 1 })
    ctx.glow.rect(px - 8, y - 11, 16, 22).fill({ color: 0xffe08a, alpha: 0.4 })
  }
  ctx.glow.circle(nose, y, 22).fill({ color: 0xfff6c8, alpha: 0.55 })
  ctx.g.circle(nose, y, 8).fill({ color: 0xffffff, alpha: 1 })
  for (let i = 0; i < 4; i += 1) {
    const puff = (step.u + i * 0.18) % 1
    ctx.glow.circle(box.x0 + 30 + i * 28, y - 18 - puff * 36, 8 + puff * 10).fill({ color: 0xfff6ea, alpha: 0.22 })
  }
}

function orbit(ctx: BlasterCtx, step: Step, _s: number): void {
  const radius = RIM + 10 + (1 - step.u) * 78
  ctx.glow.circle(ctx.to.x, ctx.to.y, radius).stroke({ width: 18, color: 0xb9c6ff, alpha: 0.32 })
  ctx.g.circle(ctx.to.x, ctx.to.y, radius).stroke({ width: 2.2, color: 0xd7e4ff, alpha: 0.95 })
  ctx.g.circle(ctx.to.x, ctx.to.y, RIM + 12).stroke({ width: 1.4, color: 0xffffff, alpha: 0.45 })
  for (let i = 0; i < 12; i += 1) {
    const a = ctx.age * 3.2 + (i * Math.PI * 2) / 12
    const fall = RIM + 10 + (1 - step.u) * (16 + i * 7)
    const x = ctx.to.x + Math.cos(a) * fall
    const y = ctx.to.y + Math.sin(a) * fall
    const arm = 5 + (i % 3)
    ctx.glow.circle(x, y, 10).fill({ color: 0xd7e4ff, alpha: 0.5 })
    line(ctx.g, { x: x - arm, y }, { x: x + arm, y }, 1.5, 0xffffff, 1)
    line(ctx.g, { x, y: y - arm }, { x, y: y + arm }, 1.5, 0xffffff, 1)
    ctx.g.circle(x, y, 2.2).fill({ color: 0xffffff, alpha: 1 })
  }
}

function ribbon(ctx: BlasterCtx, step: Step, _s: number): void {
  const spin = ctx.age * 4 + step.u * 6
  for (let band = 0; band < 2; band += 1) {
    const radius = RIM + 16 + band * 18
    ctx.g.moveTo(ctx.to.x + Math.cos(spin) * RIM, ctx.to.y + Math.sin(spin) * RIM)
    for (let i = 1; i <= 28; i += 1) {
      const a = spin + band + (i / 28) * Math.PI * 2.4
      const r = RIM + (i / 28) * (radius - RIM)
      ctx.g.lineTo(ctx.to.x + Math.cos(a) * r, ctx.to.y + Math.sin(a) * r)
    }
    ctx.g.stroke({ width: band === 0 ? 4 : 2, color: band === 0 ? 0x9ad7ff : 0xffffff, alpha: 0.95 - step.k * 0.3, cap: 'round' })
    ctx.glow.moveTo(ctx.to.x + Math.cos(spin + band) * (RIM + 8), ctx.to.y + Math.sin(spin + band) * (RIM + 8))
    for (let i = 1; i <= 18; i += 1) {
      const a = spin + band + (i / 18) * Math.PI * 2
      const r = RIM + 20 + band * 16
      ctx.glow.lineTo(ctx.to.x + Math.cos(a) * r, ctx.to.y + Math.sin(a) * r)
    }
    ctx.glow.stroke({ width: 10, color: 0x9ad7ff, alpha: 0.28, cap: 'round' })
  }
  for (let i = 0; i < 8; i += 1) {
    const a = ctx.age * 3 + i
    const r = RIM + 28 + (i % 3) * 12
    ctx.g.circle(ctx.to.x + Math.cos(a) * r, ctx.to.y + Math.sin(a) * r, 2.6).fill({ color: 0xffffff, alpha: 0.9 })
  }
}

function strands(ctx: BlasterCtx, step: Step, _s: number): void {
  const colors = [0xff5b8a, 0xfff6ea, 0x7ee7ff]
  const origin = { x: ctx.width * 0.5, y: sideBox(ctx).top + 30 }
  const n = perpendicular(origin, ctx.to)
  const mid = lerp(origin, ctx.to, 0.5)
  for (let i = 0; i < 3; i += 1) {
    const bend = (i - 1) * 110
    const knot = { x: mid.x + n.x * bend, y: mid.y + n.y * bend }
    const tip = i === 1 ? step.head : knot
    line(ctx.glow, origin, knot, 12, colors[i]!, 0.35)
    line(ctx.glow, knot, tip, 12, colors[i]!, 0.35)
    line(ctx.g, origin, knot, 3.2, colors[i]!, 1)
    line(ctx.g, knot, tip, 3.2, colors[i]!, 1)
    ctx.glow.circle(knot.x, knot.y, 16).fill({ color: colors[i]!, alpha: 0.45 })
    ctx.g.circle(knot.x, knot.y, 4).fill({ color: 0xffffff, alpha: 1 })
  }
}

function climb(ctx: BlasterCtx, step: Step, _s: number): void {
  const box = sideBox(ctx)
  const lip = ctx.to.y + RIM
  const topY = box.bottom + (lip - box.bottom) * step.u
  const halfW = 78
  ctx.glow.poly([
    ctx.to.x - halfW - 16,
    box.bottom,
    ctx.to.x + halfW + 16,
    box.bottom,
    ctx.to.x + 18,
    topY,
    ctx.to.x - 18,
    topY,
  ]).fill({ color: 0xff4a12, alpha: 0.35 })
  ctx.g.poly([
    ctx.to.x - halfW,
    box.bottom,
    ctx.to.x + halfW,
    box.bottom,
    ctx.to.x + 12,
    topY,
    ctx.to.x - 12,
    topY,
  ]).fill({ color: 0xff3b1f, alpha: 0.9 })
  ctx.g.poly([
    ctx.to.x - halfW * 0.35,
    box.bottom,
    ctx.to.x + halfW * 0.35,
    box.bottom,
    ctx.to.x,
    topY,
  ]).fill({ color: 0xffe08a, alpha: 0.95 })
  for (let i = 0; i < 8; i += 1) {
    const t = (step.u + i * 0.11) % 1
    const py = box.bottom + (topY - box.bottom) * t
    const px = ctx.to.x + Math.sin(i * 1.7 + ctx.age * 5) * (20 + (1 - t) * 40)
    ctx.glow.circle(px, py, 8).fill({ color: 0xffe08a, alpha: 0.35 })
    ctx.g.circle(px, py, 2.8).fill({ color: 0xfff6ea, alpha: 0.95 })
  }
}

function crescent(ctx: BlasterCtx, step: Step, _s: number): void {
  const cx = ctx.width * 0.5
  const cy = (ctx.from.y + ctx.to.y) * 0.5
  const dist = Math.max(RIM + 8, Math.hypot(ctx.to.x - cx, ctx.to.y - cy) - RIM)
  const reach = Math.max(18, dist * Math.max(0.18, step.u))
  const ang = Math.atan2(ctx.to.y - cy, ctx.to.x - cx)
  ctx.glow.arc(cx, cy, reach, ang - 1.2, ang + 1.2).stroke({ width: 18, color: 0xf0c56a, alpha: 0.35 })
  ctx.g.arc(cx, cy, reach, ang - 1.15, ang + 1.15).stroke({ width: 4, color: 0xfff6ea, alpha: 1 })
  ctx.g.arc(cx, cy, reach, ang - 0.55, ang + 0.55).stroke({ width: 1.6, color: 0xffffff, alpha: 0.95 })
  ctx.glow.arc(cx, cy, Math.max(12, reach - 10), ang - 0.9, ang + 0.9).stroke({ width: 8, color: 0xffffff, alpha: 0.25 })
  const tip = { x: cx + Math.cos(ang) * reach, y: cy + Math.sin(ang) * reach }
  ctx.glow.circle(tip.x, tip.y, 18).fill({ color: 0xf0c56a, alpha: 0.5 })
  ctx.g.circle(tip.x, tip.y, 4).fill({ color: 0xffffff, alpha: 1 })
}

function mane(ctx: BlasterCtx, step: Step, _s: number): void {
  const spin = ctx.age * 0.85
  const reach = RIM + 40 + step.u * 190
  ctx.glow.circle(ctx.to.x, ctx.to.y, RIM + 10).stroke({ width: 16, color: 0xf0c56a, alpha: 0.4 })
  ctx.g.circle(ctx.to.x, ctx.to.y, RIM + 8).stroke({ width: 2.4, color: 0xfff6ea, alpha: 0.95 })
  for (let i = 0; i < 24; i += 1) {
    const a = spin + (i / 24) * Math.PI * 2
    const wave = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(i * 1.9 + spin * 2))
    const len = RIM + 8 + (reach - RIM) * wave
    const inner = { x: ctx.to.x + Math.cos(a) * (RIM + 4), y: ctx.to.y + Math.sin(a) * (RIM + 4) }
    const outer = { x: ctx.to.x + Math.cos(a) * len, y: ctx.to.y + Math.sin(a) * len }
    line(ctx.glow, inner, outer, 7, i % 2 === 0 ? 0xf0c56a : 0xfff1c2, 0.45)
    line(ctx.g, inner, outer, 2.2, 0xfff6ea, 1)
  }
  for (let i = 0; i < 12; i += 1) {
    const a = -spin * 1.4 + (i / 12) * Math.PI * 2
    const len = RIM + 18 + step.u * 64
    const inner = { x: ctx.to.x + Math.cos(a) * (RIM + 6), y: ctx.to.y + Math.sin(a) * (RIM + 6) }
    const outer = { x: ctx.to.x + Math.cos(a) * len, y: ctx.to.y + Math.sin(a) * len }
    line(ctx.g, inner, outer, 1.6, 0xf0c56a, 0.9)
  }
  if (step.u > 0.28) {
    const roar = RIM + 12 + (step.u - 0.28) * 240
    ctx.glow.circle(ctx.to.x, ctx.to.y, roar).stroke({ width: 14, color: 0xf0c56a, alpha: 0.28 * (1 - step.k) })
    ctx.g.circle(ctx.to.x, ctx.to.y, roar).stroke({ width: 2, color: 0xfff6ea, alpha: 0.8 * (1 - step.k) })
  }
  for (let i = 0; i < 10; i += 1) {
    const a = spin * 2 + i
    const r = RIM + 24 + (i % 5) * 18 + step.u * 40
    ctx.g.circle(ctx.to.x + Math.cos(a) * r, ctx.to.y + Math.sin(a) * r, 2.4).fill({ color: 0xfff6ea, alpha: 0.9 })
  }
}

function ringGrow(ctx: BlasterCtx, step: Step, _s: number, close: boolean): void {
  if (!close) {
    hole(ctx, step)
    return
  }
  const box = sideBox(ctx)
  const cx = (box.x0 + box.x1) * 0.5
  const cy = ctx.to.y
  const edge = (box.x1 - box.x0) * 0.98
  const inner = RIM + 22
  const radius = edge * (1 - step.u) + inner * step.u
  ctx.glow.circle(cx, cy, Math.max(8, radius)).stroke({ width: 22, color: 0xff2d8a, alpha: 0.32 })
  ctx.g.circle(cx, cy, Math.max(8, radius)).stroke({ width: 2.6, color: 0x22e7ff, alpha: 1 })
  ctx.g.circle(cx, cy, Math.max(8, radius * 0.72)).stroke({ width: 1.4, color: 0xff2d8a, alpha: 0.75 })
  for (let i = 0; i < 12; i += 1) {
    const a = -ctx.age * 1.5 + (i / 12) * Math.PI * 2
    const r = Math.max(12, radius)
    ctx.g.circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3).fill({ color: i % 2 === 0 ? 0x22e7ff : 0xff2d8a, alpha: 1 })
  }
}

function hole(ctx: BlasterCtx, step: Step): void {
  const box = sideBox(ctx)
  const cx = (box.x0 + box.x1) * 0.5
  const cy = ctx.height * 0.41
  const open = Math.pow(Math.max(0, step.u), 0.55)
  const radius = 48 + ((box.x1 - box.x0) * 0.5 - 48) * open
  const spin = ctx.age * 1.6
  ctx.g.circle(cx, cy, Math.max(12, radius * 0.82)).fill({ color: 0x000000, alpha: 0.86 * Math.min(1, open * 1.4) })
  ctx.g.circle(cx, cy, Math.max(8, radius * 0.34)).fill({ color: 0x000000, alpha: 0.96 })
  ctx.glow.circle(cx, cy, Math.max(16, radius)).stroke({ width: 34, color: 0xf0c56a, alpha: 0.55 })
  ctx.g.circle(cx, cy, Math.max(16, radius)).stroke({ width: 3.5, color: 0xfff6ea, alpha: 1 })
  for (let arm = 0; arm < 3; arm += 1) {
    ctx.g.moveTo(cx + Math.cos(spin + arm) * radius * 0.2, cy + Math.sin(spin + arm) * radius * 0.2)
    for (let i = 1; i <= 16; i += 1) {
      const t = i / 16
      const a = spin + arm * ((Math.PI * 2) / 3) + t * 3.6
      const r = radius * (0.22 + t * 0.78)
      ctx.g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    }
    ctx.g.stroke({ width: 2, color: 0xfff1c2, alpha: 0.8, cap: 'round' })
  }
  for (let i = 0; i < 18; i += 1) {
    const fall = ((step.u * 2 + i * 0.07) % 1)
    const a = spin * 1.3 + i * 0.9
    const r = radius * (0.96 - fall * 0.78)
    ctx.g.circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.2).fill({ color: 0xffffff, alpha: 0.9 })
  }
}

function blast(ctx: BlasterCtx, at: Pt, s: number, color: number, radius: number): void {
  const size = radius * s
  ctx.glow.circle(at.x, at.y, size * 1.7).fill({ color, alpha: 0.4 })
  ctx.g.circle(at.x, at.y, size).fill({ color, alpha: 0.95 })
  ctx.g.circle(at.x, at.y, size * 0.42).fill({ color: 0xffffff, alpha: 1 })
}

function pop(ctx: BlasterCtx, at: Pt, k: number, color: number, radius: number): void {
  const fade = 1 - k
  ctx.g.circle(at.x, at.y, radius * (0.4 + k)).stroke({ width: 2, color, alpha: fade })
  ctx.g.circle(at.x, at.y, 4).fill({ color: 0xffffff, alpha: fade })
}

const bombTint: Partial<Record<LiveId, number>> = {
  heart: 0xff4d88,
  hearts: 0xff4d88,
  rosa: 0xff1a3c,
  tiktok: 0x22e7ff,
  gg: 0xb8fff2,
  ice: 0x9ee7ff,
  perfume: 0xd7a6ff,
  doughnut: 0xff8fb8,
  confetti: 0xffd15c,
  aura: 0xff8ec8,
  shades: 0xf0c56a,
  thunder: 0xfff4c4,
  blaze: 0xff6a1a,
  money: 0x7dff6a,
  train: 0xffe08a,
  galaxy: 0xd7e4ff,
  wind: 0x9ad7ff,
  prism: 0x7ee7ff,
  storm: 0xfff6d0,
  inferno: 0xff4a12,
  sabre: 0xf0c56a,
  lion: 0xf0c56a,
  universe: 0xf0c56a,
  'tiktok-universe': 0xff2d8a,
}

function bombDrop(ctx: BlasterCtx, step: Step, id: LiveId): void {
  const rank = id === 'lion' || id === 'universe' || id === 'tiktok-universe' ? 3
    : id === 'storm' || id === 'inferno' || id === 'sabre' || id === 'prism' || id === 'galaxy' || id === 'wind' || id === 'train' || id === 'money' ? 2
    : id === 'confetti' || id === 'aura' || id === 'shades' || id === 'thunder' || id === 'blaze' ? 1
    : 0
  const count = rank === 3 ? 5 : rank === 2 ? 3 : 1
  const box = sideBox(ctx)
  const aim = edge(ctx.from, ctx.to)
  const color = bombTint[id] ?? 0xfff6ea
  for (let i = 0; i < count; i += 1) {
    const delay = i * (rank >= 2 ? 0.1 : 0)
    const u = clamp((step.u - delay) / Math.max(0.35, 1 - delay), 0, 1)
    if (u <= 0) continue
    const spread = (i - (count - 1) / 2) * (rank >= 3 ? 120 : rank === 2 ? 90 : 0)
    const y0 = box.top + 78
    const land = {
      x: clamp(aim.x + spread, box.x0 + 48, box.x1 - 48),
      y: Math.max(y0 + 40, aim.y),
    }
    const fall = Math.min(1, u / 0.78)
    const x = land.x
    const y = y0 + (land.y - y0) * fall
    if (fall < 1) {
      const shell = 14 + rank * 9
      ctx.glow.circle(x, y, shell * 2.2).fill({ color, alpha: 0.55 })
      ctx.g.circle(x, y, shell).fill({ color, alpha: 0.96 })
      ctx.g.circle(x, y - shell * 0.28, shell * 0.42).fill({ color: 0xffffff, alpha: 1 })
      line(ctx.glow, { x, y: y - shell * 4.2 }, { x, y: y - shell * 0.8 }, 12 + rank * 4, color, 0.6)
      continue
    }
    const boom = (u - 0.78) / 0.22
    const fade = 1 - clamp(step.k / (rank >= 2 ? 0.9 : 0.5), 0, 1)
    const blastR = (48 + rank * 34) * (0.55 + boom * 0.45)
    ctx.glow.circle(land.x, land.y, blastR * 0.72).fill({ color, alpha: 0.28 * fade })
    ctx.glow.circle(land.x, land.y, blastR).stroke({ width: 16 + rank * 8, color, alpha: 0.5 * fade })
    ctx.g.circle(land.x, land.y, blastR).stroke({ width: 3, color: 0xffffff, alpha: 0.95 * fade })
    ctx.g.circle(land.x, land.y, blastR * 0.5).stroke({ width: 2, color, alpha: 0.8 * fade })
    const streaks = 5 + rank
    for (let shard = 0; shard < streaks; shard += 1) {
      const a = (shard / streaks) * Math.PI * 2 + i * 0.4
      const inner = blastR * 0.72
      const outer = blastR * (1.05 + boom * 0.25)
      line(ctx.g, { x: land.x + Math.cos(a) * inner, y: land.y + Math.sin(a) * inner }, { x: land.x + Math.cos(a) * outer, y: land.y + Math.sin(a) * outer }, 3.2, 0xfff6ea, fade)
    }
  }
}

function bloom(g: Graphics, x: number, y: number, size: number, color: number, alpha: number): void {
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2
    g.circle(x + Math.cos(a) * size * 0.55, y + Math.sin(a) * size * 0.55, size * 0.42).fill({ color, alpha })
  }
  g.circle(x, y, size * 0.28).fill({ color: 0xfff6ea, alpha })
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

function line(g: Graphics, a: Pt, b: Pt, width: number, color: number, alpha: number): void {
  g.moveTo(a.x, a.y)
  g.lineTo(b.x, b.y)
  g.stroke({ width, color, alpha, cap: 'round' })
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function behind(from: Pt, to: Pt, head: Pt, dist: number): Pt {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  return { x: head.x - (dx / len) * dist, y: head.y - (dy / len) * dist }
}

const RIM = 58

function edge(from: Pt, to: Pt): Pt {
  return behind(from, to, to, RIM)
}

function sideBox(ctx: BlasterCtx): { x0: number; x1: number; top: number; bottom: number } {
  const right = ctx.to.x >= ctx.width * 0.5
  return {
    x0: right ? ctx.width * 0.5 : 0,
    x1: right ? ctx.width : ctx.width * 0.5,
    top: ctx.height * 0.14,
    bottom: ctx.height * 0.68,
  }
}

function jag(g: Graphics, x: number, y0: number, y1: number, local: number, width: number, color: number, salt: number): void {
  const y = y0 + (y1 - y0) * local
  g.moveTo(x, y0)
  const steps = 7
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    const yy = y0 + (y - y0) * t
    const kick = i === steps ? 0 : Math.sin(i * 1.7 + salt) * 18
    g.lineTo(x + kick, yy)
  }
  g.stroke({ width, color, alpha: 1, cap: 'round', join: 'round' })
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
