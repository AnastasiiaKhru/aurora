import type { Graphics } from 'pixi.js'
import type { TeamId } from '../../types/Team.ts'
import type { Pt } from './motion.ts'

export interface Ink {
  core: number
  hot: number
  deep: number
  metal: number
  spark: number
  accent: number
}

export function inkOf(team: TeamId): Ink {
  if (team === 'red') {
    return { core: 0xfff4f6, hot: 0xd92d4a, deep: 0x7f142b, metal: 0xf5c451, spark: 0xf3c3cc, accent: 0xb91f3a }
  }
  return { core: 0xf4f8ff, hot: 0x2583ff, deep: 0x0e3f91, metal: 0xf5c451, spark: 0xd5e4ff, accent: 0x1768d8 }
}

export function stroke(g: Graphics, pts: number[], width: number, color: number, alpha: number): void {
  if (pts.length < 4 || alpha <= 0.02) return
  g.moveTo(pts[0]!, pts[1]!)
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!)
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' })
}

export function star(g: Graphics, x: number, y: number, size: number, color: number, alpha: number, spin = -Math.PI / 2): void {
  const pts: number[] = []
  for (let i = 0; i < 10; i += 1) {
    const angle = spin + (i * Math.PI) / 5
    const radius = i % 2 === 0 ? size : size * 0.42
    pts.push(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
  }
  g.poly(pts).fill({ color, alpha })
}

export function maple(g: Graphics, x: number, y: number, size: number, color: number, alpha: number, spin = 0): void {
  const pts: number[] = []
  for (let i = 0; i < 12; i += 1) {
    const angle = spin - Math.PI / 2 + (i * Math.PI) / 6
    const lobe = i % 2 === 0 ? 1 : 0.34
    const reach = i % 4 === 0 ? 1 : 0.78
    pts.push(x + Math.cos(angle) * size * lobe * reach, y + Math.sin(angle) * size * lobe * 0.92)
  }
  g.poly(pts).fill({ color, alpha })
  const stem = Math.cos(spin + Math.PI / 2)
  const side = Math.sin(spin + Math.PI / 2)
  g.rect(x - size * 0.08 + stem * size * 0.35, y - size * 0.08 + side * size * 0.35, size * 0.16, size * 0.42).fill({ color: 0xf3e2c4, alpha: alpha * 0.9 })
}

export function petal(g: Graphics, x: number, y: number, rot: number, size: number, color: number, alpha: number): void {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const tipX = x + c * size
  const tipY = y + s * size
  const leftX = x + -s * size * 0.38
  const leftY = y + c * size * 0.38
  const rightX = x + s * size * 0.38
  const rightY = y - c * size * 0.38
  g.poly([tipX, tipY, leftX, leftY, x - c * size * 0.15, y - s * size * 0.15, rightX, rightY]).fill({ color, alpha })
  g.poly([tipX, tipY, x + c * size * 0.2, y + s * size * 0.2, x - s * size * 0.08, y + c * size * 0.08]).fill({ color: 0xfff6ee, alpha: alpha * 0.28 })
}

export function roseHead(g: Graphics, x: number, y: number, size: number, rot: number, open: number, team: TeamId): void {
  const ink = inkOf(team)
  const bloom = 0.35 + open * 0.65
  const velvet = team === 'red' ? 0xc0183a : 0xb42348
  const shade = team === 'red' ? 0x7a1028 : 0x6d2744
  const gold = ink.metal
  for (let layer = 0; layer < 3; layer += 1) {
    const count = 5 + layer
    const radius = size * bloom * (0.45 + layer * 0.28)
    for (let i = 0; i < count; i += 1) {
      const angle = rot + (i / count) * Math.PI * 2 + layer * 0.4
      petal(g, x, y, angle, radius, i % 2 === 0 ? velvet : shade, 0.92 - layer * 0.08)
    }
  }
  g.circle(x, y, size * 0.22 * bloom).fill({ color: gold, alpha: 0.95 })
  g.circle(x - size * 0.06, y - size * 0.06, size * 0.08).fill({ color: 0xfff8f2, alpha: 0.55 })
}

export function stem(g: Graphics, from: Pt, to: Pt, width: number): void {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  g.poly([
    from.x + nx * width, from.y + ny * width,
    to.x + nx * width * 0.4, to.y + ny * width * 0.4,
    to.x - nx * width * 0.4, to.y - ny * width * 0.4,
    from.x - nx * width, from.y - ny * width,
  ]).fill({ color: 0x2f6a3c, alpha: 0.95 })
  const mid = { x: (from.x + to.x) * 0.5, y: (from.y + to.y) * 0.5 }
  g.ellipse(mid.x + nx * width * 2.2, mid.y + ny * width * 2.2, width * 2.4, width * 0.9).fill({ color: 0x3e8a4c, alpha: 0.9 })
  for (let i = 0; i < 3; i += 1) {
    const t = 0.25 + i * 0.22
    const px = from.x + dx * t
    const py = from.y + dy * t
    const side = i % 2 === 0 ? 1 : -1
    g.poly([
      px, py,
      px + nx * side * width * 1.6, py + ny * side * width * 1.6,
      px + dx / len * width, py + dy / len * width,
    ]).fill({ color: 0xd7c4a2, alpha: 0.85 })
  }
}

export function crystalShard(g: Graphics, x: number, y: number, size: number, rot: number, color: number, alpha: number): void {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const tip = { x: x + c * size, y: y + s * size }
  const left = { x: x - s * size * 0.38, y: y + c * size * 0.38 }
  const right = { x: x + s * size * 0.28, y: y - c * size * 0.28 }
  const tail = { x: x - c * size * 0.45, y: y - s * size * 0.45 }
  g.poly([tip.x, tip.y, left.x, left.y, tail.x, tail.y, right.x, right.y]).fill({ color, alpha: alpha * 0.72 })
  g.poly([tip.x, tip.y, x, y, right.x, right.y]).fill({ color: 0xffffff, alpha: alpha * 0.38 })
  g.poly([tip.x, tip.y, left.x, left.y, x, y]).fill({ color: 0x9fd0ff, alpha: alpha * 0.22 })
}

export function planetBody(g: Graphics, x: number, y: number, size: number, spin: number, team: TeamId): void {
  const ink = inkOf(team)
  g.circle(x, y, size * 1.35).fill({ color: ink.hot, alpha: 0.16 })
  g.circle(x, y, size).fill({ color: team === 'red' ? 0x6a2a38 : 0x243864, alpha: 0.96 })
  g.ellipse(x, y - size * 0.15, size * 0.72, size * 0.28).fill({ color: 0xfff6ea, alpha: 0.18 })
  g.ellipse(x, y + size * 0.2, size * 0.9, size * 0.16).fill({ color: ink.metal, alpha: 0.35 })
  g.circle(x - size * 0.28, y - size * 0.22, size * 0.22).fill({ color: 0xffffff, alpha: 0.22 })
  g.ellipse(x, y, size * 1.55, size * 0.38).stroke({ width: 1.4, color: ink.metal, alpha: 0.55 })
  void spin
}

export function crown(g: Graphics, x: number, y: number, size: number, color: number, alpha: number): void {
  g.poly([
    x - size, y + size * 0.35,
    x - size * 0.72, y - size * 0.55,
    x - size * 0.35, y - size * 0.05,
    x, y - size * 0.75,
    x + size * 0.35, y - size * 0.05,
    x + size * 0.72, y - size * 0.55,
    x + size, y + size * 0.35,
  ]).fill({ color, alpha })
  g.circle(x, y - size * 0.75, size * 0.12).fill({ color: 0xfff6ea, alpha })
}

export function portalRing(g: Graphics, x: number, y: number, rx: number, ry: number, color: number, alpha: number): void {
  g.ellipse(x, y, rx, ry).stroke({ width: 2.4, color, alpha })
  g.ellipse(x, y, rx * 0.72, ry * 0.72).stroke({ width: 1.1, color: 0xffffff, alpha: alpha * 0.7 })
  g.ellipse(x, y, rx * 0.4, ry * 0.55).fill({ color, alpha: alpha * 0.18 })
}

export function silhouette(g: Graphics, x: number, y: number, size: number, color: number, alpha: number): void {
  g.circle(x, y - size * 0.35, size * 0.28).fill({ color, alpha })
  g.ellipse(x, y + size * 0.25, size * 0.34, size * 0.42).fill({ color, alpha: alpha * 0.8 })
}
