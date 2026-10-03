import { Graphics } from 'pixi.js'
import type { ParticleField } from '../systems/ParticleSystem.ts'

export function strokePath(g: Graphics, pts: number[], width: number, color: number, alpha: number): void {
  if (pts.length < 4 || alpha <= 0.01) return
  g.moveTo(pts[0]!, pts[1]!)
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!)
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' })
}

export function jagged(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
  amount: number,
  segs = 12,
): number[] {
  const pts: number[] = []
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs
    const mag = i === 0 || i === segs ? 0 : Math.sin(seed * 9.1 + i * 2.4) * amount
    pts.push(x1 + dx * t + nx * mag, y1 + dy * t + ny * mag)
  }
  return pts
}

export function drawHeart(g: Graphics, x: number, y: number, s: number, color: number, alpha: number): void {
  g.moveTo(x, y + s * 0.32)
  g.bezierCurveTo(x, y + s * 0.08, x - s * 0.62, y + s * 0.02, x - s * 0.55, y - s * 0.28)
  g.bezierCurveTo(x - s * 0.55, y - s * 0.58, x - s * 0.18, y - s * 0.66, x, y - s * 0.32)
  g.bezierCurveTo(x + s * 0.18, y - s * 0.66, x + s * 0.55, y - s * 0.58, x + s * 0.55, y - s * 0.28)
  g.bezierCurveTo(x + s * 0.62, y + s * 0.02, x, y + s * 0.08, x, y + s * 0.32)
  g.fill({ color, alpha })
}

export function drawPetal(g: Graphics, x: number, y: number, rot: number, s: number, color: number, alpha: number): void {
  const pts: number[] = []
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  for (let i = 0; i <= 8; i += 1) {
    const a = (i / 8) * Math.PI * 2
    const px = Math.cos(a) * s * 0.36
    const py = Math.sin(a) * s
    pts.push(x + px * cos - py * sin, y + px * sin + py * cos)
  }
  g.poly(pts).fill({ color, alpha })
}

export function drawDiamond(g: Graphics, x: number, y: number, s: number, color: number, alpha: number): void {
  g.poly([x, y - s, x + s * 0.68, y, x, y + s, x - s * 0.68, y]).fill({ color, alpha })
}

export function renderParticles(field: ParticleField, additive: Graphics, normal: Graphics): void {
  for (const particle of field.pool) {
    if (!particle.active) continue
    const fade = particle.life / particle.max
    if (fade <= 0.03) continue
    const g = particle.additive ? additive : normal
    const alpha = fade * (particle.preset === 'smoke' ? 0.32 : 0.92)
    if (particle.preset === 'heart') {
      drawHeart(g, particle.x, particle.y, particle.size, particle.color, alpha)
    } else if (particle.preset === 'petal') {
      drawPetal(g, particle.x, particle.y, particle.rot, particle.size, particle.color, alpha)
    } else if (particle.preset === 'confetti') {
      const c = Math.cos(particle.rot)
      const s = Math.sin(particle.rot)
      const w = particle.size * 0.7
      const h = particle.size * 1.15
      const pts = [w, h, -w, h, -w, -h, w, -h]
      const shaped: number[] = []
      for (let i = 0; i < pts.length; i += 2) {
        const px = pts[i]!
        const py = pts[i + 1]!
        shaped.push(particle.x + px * c - py * s, particle.y + px * s + py * c)
      }
      g.poly(shaped).fill({ color: particle.color, alpha })
    } else {
      const size = particle.preset === 'smoke' ? particle.size * (1.2 + (1 - fade)) : particle.size
      g.circle(particle.x, particle.y, Math.max(0.4, size)).fill({ color: particle.color, alpha })
    }
  }
}
