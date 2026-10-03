import type { Graphics } from 'pixi.js'
import { teamPalette } from '../config/effectConfig.ts'
import { director } from '../systems/GameDirector.ts'
import type { AttackCommand } from '../types/Battle.ts'
import type { AttackType } from '../types/Gift.ts'
import type { TeamId } from '../types/Team.ts'
import { clamp, easeInCubic, easeInOut, easeOutCubic } from '../utils/math.ts'
import { drawDiamond, drawHeart, jagged, strokePath } from './draw.ts'
import type { EffectsRenderer } from './EffectsRenderer.ts'

interface LiveAttack {
  cmd: AttackCommand
  age: number
  fired: boolean[]
  history: { x: number; y: number }[]
  seed: number
}

export class AttackRenderer {
  private active: LiveAttack[] = []
  private readonly effects: EffectsRenderer

  constructor(effects: EffectsRenderer) {
    this.effects = effects
  }

  reset(): void {
    this.active = []
  }

  update(dt: number, width: number, height: number): void {
    const status = director.battle.status
    if (status === 'running' || status === 'finishing') {
      for (const cmd of director.attacks.pull(this.active.length)) {
        this.active.push({
          cmd,
          age: 0,
          fired: cmd.impacts.map(() => false),
          history: [],
          seed: Math.random() * 100,
        })
      }
    }

    const g = this.effects.attackGfx
    g.clear()
    for (const live of this.active) {
      live.age += dt
      const t = live.cmd.duration <= 0 ? 1 : live.age / live.cmd.duration
      const head = this.draw(g, live, t, width, height)
      live.history.push(head)
      if (live.history.length > 9) live.history.shift()
      this.resolveHits(live, t, width, height)
    }
    this.active = this.active.filter((live) => live.age <= live.cmd.duration + 0.02)
  }

  private draw(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    switch (live.cmd.attackType) {
      case 'energy_bullet':
        return this.bullet(g, live, t, width, height)
      case 'sparkle_shot':
        return this.sparkle(g, live, t, width, height)
      case 'rose':
        return this.rose(g, live, t, width, height)
      case 'heart':
        return this.heart(g, live, t, width, height)
      case 'fireball':
        return this.fireball(g, live, t, width, height)
      case 'lightning':
        return this.lightning(g, live, t, width, height)
      case 'magic':
        return this.magic(g, live, t, width, height)
      case 'rocket':
        return this.rocket(g, live, t, width, height, false)
      case 'missile':
        return this.rocket(g, live, t, width, height, true)
      case 'beam':
        return this.beam(g, live, t, width, height, false)
      case 'laser':
        return this.beam(g, live, t, width, height, true)
      case 'fire_blast':
        return this.fireBlast(g, live, t, width, height)
      case 'tornado':
        return this.tornado(g, live, t, width, height)
      case 'airstrike':
        return this.rain(g, live, t, width, height, 'strike')
      case 'thunderstorm':
        return this.storm(g, live, t, width, height)
      case 'meteor':
        return this.meteor(g, live, t, width, height)
      case 'dragon':
        return this.dragon(g, live, t, width, height)
      case 'black_hole':
        return this.blackHole(g, live, t, width, height)
      case 'cosmic':
        return this.cosmic(g, live, t, width, height)
      case 'sword':
        return this.sword(g, live, t, width, height)
      case 'firestorm':
        return this.rain(g, live, t, width, height, 'fire')
      case 'pulse':
        return this.pulse(g, live, t, width, height)
      default:
        return this.bullet(g, live, t, width, height)
    }
  }

  private bullet(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const travel = easeInOut(clamp(t / 0.74, 0, 1))
    const point = lerp2(ends.from, ends.to, travel)
    this.trail(g, live, teamColor(live.cmd.team), 3)
    const size = 3.5 + live.cmd.intensity * 2
    g.circle(point.x, point.y, size * 2.1).fill({ color: teamColor(live.cmd.team), alpha: 0.28 })
    g.circle(point.x, point.y, size).fill({ color: 0xfff8f2, alpha: 0.95 })
    return point
  }

  private sparkle(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const travel = easeOutCubic(clamp(t / 0.7, 0, 1))
    const base = lerp2(ends.from, ends.to, travel)
    const side = perpendicular(ends.from, ends.to)
    const wobble = Math.sin(travel * Math.PI * 3 + live.seed) * 16
    const point = { x: base.x + side.x * wobble, y: base.y + side.y * wobble }
    drawDiamond(g, point.x, point.y, 6 + live.cmd.intensity * 4, 0xfff6d8, 0.95)
    g.circle(point.x, point.y, 12 + live.cmd.intensity * 6).fill({ color: 0xfff6d8, alpha: 0.16 })
    if (live.cmd.intensity > 0.75 && Math.random() < 0.7) {
      this.effects.combat.spawn('spark', point.x, point.y, 1, { color: 0xfff3c4, scale: 0.8 })
    }
    return point
  }

  private rose(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const travel = easeInOut(clamp(t / 0.72, 0, 1))
    const base = lerp2(ends.from, ends.to, travel)
    const point = { x: base.x, y: base.y - Math.sin(travel * Math.PI) * 22 }
    const size = 5 + live.cmd.intensity * 3.5
    g.circle(point.x, point.y, size * 2.2).fill({ color: 0xff4b63, alpha: 0.22 })
    g.circle(point.x, point.y, size).fill({ color: 0xffd0da, alpha: 0.95 })
    if (Math.random() < 0.85) this.effects.combat.spawn('petal', point.x, point.y, 1, { scale: 0.55 + live.cmd.intensity * 0.2 })
    return point
  }

  private heart(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const travel = easeOutCubic(clamp(t / 0.76, 0, 1))
    const base = lerp2(ends.from, ends.to, travel)
    const point = { x: base.x, y: base.y - Math.sin(travel * Math.PI) * 14 }
    drawHeart(g, point.x, point.y, 7 + live.cmd.intensity * 5, 0xff8ea8, 0.95)
    g.circle(point.x, point.y, 16).fill({ color: 0xff8ea8, alpha: 0.12 })
    if (Math.random() < 0.55) this.effects.combat.spawn('heart', point.x, point.y, 1, { scale: 0.45 })
    return point
  }

  private fireball(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const travel = easeInCubic(clamp(t / 0.7, 0, 1))
    const point = lerp2(ends.from, ends.to, travel)
    const size = 7 + travel * 8 + live.cmd.intensity * 3
    this.trail(g, live, 0xff7a3c, size * 0.45)
    g.circle(point.x, point.y, size * 1.7).fill({ color: 0xff4b2a, alpha: 0.28 })
    g.circle(point.x, point.y, size).fill({ color: 0xffb15a, alpha: 0.85 })
    g.circle(point.x, point.y, size * 0.45).fill({ color: 0xfff3d2, alpha: 0.95 })
    if (Math.random() < 0.8) this.effects.combat.spawn('fire', point.x, point.y, 1, { scale: 0.7 })
    return point
  }

  private lightning(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const flicker = Math.sin(this.effects.time * 48 + live.seed) > 0 ? 1 : 0.45
    const bolt = jagged(ends.from.x, ends.from.y, ends.to.x, ends.to.y, live.seed + this.effects.time * 20, 22)
    strokePath(g, bolt, 8, teamColor(live.cmd.team), 0.28 * flicker)
    strokePath(g, bolt, 2.4, 0xf4fbff, 0.95 * flicker)
    if (Math.random() < 0.8) this.effects.combat.spawn('electric', ends.to.x, ends.to.y, 2, { scale: 0.8 })
    return { x: ends.to.x, y: ends.to.y + (1 - t) }
  }

  private magic(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const travel = easeInOut(clamp(t / 0.74, 0, 1))
    const point = lerp2(ends.from, ends.to, travel)
    g.circle(point.x, point.y, 8 + live.cmd.intensity * 4).fill({ color: 0xd9ccff, alpha: 0.9 })
    g.circle(point.x, point.y, 18).stroke({ width: 1.4, color: 0xfff6ea, alpha: 0.45 })
    for (let i = 0; i < 3; i += 1) {
      const ang = this.effects.time * 6 + i * 2.1
      const ox = Math.cos(ang) * 16
      const oy = Math.sin(ang) * 16
      g.circle(point.x + ox, point.y + oy, 2.4).fill({ color: 0xfff6ea, alpha: 0.9 })
    }
    return point
  }

  private rocket(
    g: Graphics,
    live: LiveAttack,
    t: number,
    width: number,
    height: number,
    heavy: boolean,
  ): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const travel = easeInOut(clamp(t / (heavy ? 0.78 : 0.82), 0, 1))
    const arc = Math.sin(Math.PI * travel) * (heavy ? -height * 0.06 : -height * 0.11)
    const point = { x: lerp(ends.from.x, ends.to.x, travel), y: lerp(ends.from.y, ends.to.y, travel) + arc }
    const prevT = Math.max(0, travel - 0.03)
    const prev = {
      x: lerp(ends.from.x, ends.to.x, prevT),
      y: lerp(ends.from.y, ends.to.y, prevT) + Math.sin(Math.PI * prevT) * (heavy ? -height * 0.06 : -height * 0.11),
    }
    const ang = Math.atan2(point.y - prev.y, point.x - prev.x)
    const cos = Math.cos(ang)
    const sin = Math.sin(ang)
    const nose = heavy ? 20 : 16
    g.poly([
      point.x + cos * nose,
      point.y + sin * nose,
      point.x - cos * 12 - sin * 5,
      point.y - sin * 12 + cos * 5,
      point.x - cos * 12 + sin * 5,
      point.y - sin * 12 - cos * 5,
    ]).fill({ color: heavy ? 0xd7e4ff : 0xfff6ea })
    g.circle(point.x - cos * 14, point.y - sin * 14, heavy ? 6 : 4).fill({ color: 0xff7a3c, alpha: 0.85 })
    if (Math.random() < 0.9) {
      this.effects.combat.spawn('smoke', point.x - cos * 16, point.y - sin * 16, 1, { scale: heavy ? 0.85 : 0.55 })
    }
    return point
  }

  private beam(g: Graphics, live: LiveAttack, t: number, width: number, height: number, laser: boolean): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const grow = easeOutCubic(clamp(t / (laser ? 0.22 : 0.34), 0, 1))
    const end = lerp2(ends.from, ends.to, grow)
    const pulse = 0.75 + Math.sin(this.effects.time * 18) * 0.25
    const color = laser ? 0xfff6ea : teamColor(live.cmd.team)
    g.moveTo(ends.from.x, ends.from.y).lineTo(end.x, end.y).stroke({
      width: (laser ? 22 : 14) * Math.min(live.cmd.intensity, 1.6) * pulse,
      color,
      alpha: laser ? 0.22 : 0.28,
      cap: 'round',
    })
    g.moveTo(ends.from.x, ends.from.y).lineTo(end.x, end.y).stroke({
      width: laser ? 4.5 : 3,
      color: 0xffffff,
      alpha: 0.92,
      cap: 'round',
    })
    if (Math.random() < 0.7) this.effects.combat.spawn(laser ? 'spark' : 'electric', end.x, end.y, 1, { scale: 0.7 })
    return end
  }

  private fireBlast(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const travel = easeOutCubic(clamp(t / 0.48, 0, 1))
    const point = lerp2(ends.from, ends.to, travel)
    const blast = clamp((t - 0.42) / 0.4, 0, 1)
    g.circle(point.x, point.y, 12 + travel * 10).fill({ color: 0xff8a3d, alpha: 0.8 })
    if (blast > 0) {
      g.ellipse(ends.to.x, ends.to.y, 30 + blast * 70, 18 + blast * 24).fill({ color: 0xff5a32, alpha: 0.28 * (1 - blast) + 0.18 })
      g.ellipse(ends.to.x, ends.to.y, 16 + blast * 40, 10 + blast * 16).fill({ color: 0xffe1b0, alpha: 0.35 * (1 - blast * 0.4) })
      if (Math.random() < 0.8) this.effects.combat.spawn('fire', ends.to.x, ends.to.y, 2, { scale: 1 })
    }
    return point
  }

  private tornado(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const heightSpan = (90 + live.cmd.intensity * 40) * (0.75 + Math.sin(t * Math.PI) * 0.25)
    for (let strand = 0; strand < 3; strand += 1) {
      const pts: number[] = []
      for (let i = 0; i <= 16; i += 1) {
        const p = i / 16
        const ang = this.effects.time * 7 + p * 10 + strand * 2.1
        const rad = (6 + p * 32) * Math.min(live.cmd.intensity, 1.7)
        pts.push(ends.to.x + Math.cos(ang) * rad, ends.to.y - heightSpan * 0.55 + p * heightSpan)
      }
      strokePath(g, pts, strand === 0 ? 3 : 1.4, strand % 2 ? 0xd5ecff : 0xfff4e8, 0.55)
    }
    g.ellipse(ends.to.x, ends.to.y + 16, 28 + live.cmd.intensity * 10, 9).stroke({ width: 2, color: teamColor(live.cmd.team), alpha: 0.45 })
    if (Math.random() < 0.85) this.effects.combat.spawn('smoke', ends.to.x, ends.to.y, 1, { scale: 0.7 })
    return ends.to
  }

  private rain(g: Graphics, live: LiveAttack, t: number, width: number, height: number, kind: 'strike' | 'fire'): { x: number; y: number } {
    live.cmd.impacts.forEach((at, index) => {
      const point = this.impactPoint(live, index, width, height)
      const local = clamp((t - (at - 0.24)) / 0.24, 0, 1)
      if (local <= 0) return
      const fall = easeInCubic(local)
      const x = point.x
      const y = -24 + (point.y + 24) * fall
      if (kind === 'fire') {
        g.circle(x, y, 14).fill({ color: 0xff5a32, alpha: 0.28 })
        g.circle(x, y, 6).fill({ color: 0xffe1b0, alpha: 0.95 })
        if (Math.random() < 0.4) this.effects.combat.spawn('fire', x, y, 1, { scale: 0.6 })
      } else {
        g.roundRect(x - 1.5, y - 28, 3, 28, 2).fill({ color: 0xfff6ea, alpha: 0.85 })
        g.circle(x, y, 4).fill({ color: 0xffd0a8, alpha: 0.9 })
        if (Math.random() < 0.45) this.effects.combat.spawn('smoke', x, y, 1, { scale: 0.4 })
      }
    })
    return { x: live.cmd.toX * width, y: live.cmd.toY * height }
  }

  private storm(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    g.rect(width * (live.cmd.team === 'red' ? 0.5 : 0), height * 0.12, width * 0.5, height * 0.7).fill({ color: 0x07101f, alpha: 0.18 })
    live.cmd.impacts.forEach((at, index) => {
      const local = 1 - Math.min(1, Math.abs(t - at) / 0.07)
      if (local <= 0) return
      const point = this.impactPoint(live, index, width, height)
      const bolt = jagged(point.x + (index - 1.5) * 18, height * 0.08, point.x, point.y, live.seed + index * 9, 26)
      strokePath(g, bolt, 7, 0x8eb6ff, 0.35 * local)
      strokePath(g, bolt, 2.2, 0xf7fbff, 0.95 * local)
    })
    return ends.to
  }

  private meteor(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const fall = easeInCubic(clamp(t / 0.7, 0, 1))
    const start = { x: ends.to.x + width * 0.07, y: -36 }
    const point = lerp2(start, ends.to, fall)
    g.moveTo(point.x - (ends.to.x - start.x) * 0.08, point.y - 46).lineTo(point.x, point.y).stroke({ width: 10, color: 0xff7a3c, alpha: 0.35, cap: 'round' })
    g.circle(point.x, point.y, 16 + live.cmd.intensity * 4).fill({ color: 0xff8a3d, alpha: 0.35 })
    g.circle(point.x, point.y, 9).fill({ color: 0xfff1d0, alpha: 0.95 })
    if (Math.random() < 0.9) this.effects.combat.spawn('fire', point.x, point.y, 1, { scale: 0.9 })
    if (t > 0.7) {
      const k = clamp((t - 0.7) / 0.3, 0, 1)
      g.circle(ends.to.x, ends.to.y, 18 + k * 130).stroke({ width: 3, color: 0xfff1d0, alpha: (1 - k) * 0.85 })
      g.circle(ends.to.x, ends.to.y, 12 + k * 48).fill({ color: 0xffe1b0, alpha: (1 - k) * 0.28 })
    }
    return point
  }

  private dragon(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const travel = easeInOut(clamp(t / 0.86, 0, 1))
    const point = sweepPoint(live.cmd.team, travel, width, height)
    this.trail(g, live, 0xff6a32, 8)
    g.circle(point.x, point.y, 22 + live.cmd.intensity * 4).fill({ color: 0xff4b2a, alpha: 0.25 })
    g.circle(point.x, point.y, 12).fill({ color: 0xffe1b0, alpha: 0.92 })
    g.circle(point.x + 8 * (live.cmd.team === 'red' ? 1 : -1), point.y - 4, 3).fill({ color: 0xfff8f2, alpha: 0.9 })
    if (Math.random() < 0.95) this.effects.combat.spawn('fire', point.x, point.y, 2, { scale: 1 })
    return point
  }

  private blackHole(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    const suck = clamp(t / 0.74, 0, 1)
    const radius = (18 + suck * 84) * Math.min(1.4, 0.75 + live.cmd.intensity * 0.25)
    g.circle(ends.to.x, ends.to.y, radius).fill({ color: 0x07060f, alpha: 0.9 * Math.min(1, suck + 0.2) })
    g.circle(ends.to.x, ends.to.y, radius * 0.38).fill({ color: 0x000000, alpha: 0.95 })
    g.ellipse(ends.to.x, ends.to.y, radius * 1.5, radius * 0.46).stroke({ width: 3, color: 0xd9cbff, alpha: 0.72 })
    g.ellipse(ends.to.x, ends.to.y, radius * 1.15, radius * 0.34).stroke({ width: 1.4, color: 0xfff3d4, alpha: 0.4 })
    if (t < 0.74 && Math.random() < 0.9) {
      const ang = Math.random() * Math.PI * 2
      const dist = radius * (1.1 + Math.random() * 0.8)
      this.effects.combat.spawn('cosmic', ends.to.x + Math.cos(ang) * dist, ends.to.y + Math.sin(ang) * dist * 0.42, 1, {
        angle: ang + Math.PI,
        speed: 2.2,
        scale: 0.8,
      })
    }
    if (t >= 0.74) {
      const k = clamp((t - 0.74) / 0.26, 0, 1)
      g.circle(ends.to.x, ends.to.y, radius + k * 90).stroke({ width: 2, color: 0xfff6ea, alpha: (1 - k) * 0.7 })
    }
    return ends.to
  }

  private cosmic(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const ends = endsOf(live, width, height)
    for (let i = 0; i < 4; i += 1) {
      const local = clamp((t - i * 0.06) / 0.55, 0, 1)
      if (local <= 0) continue
      g.circle(ends.to.x, ends.to.y, 16 + local * (90 + i * 28)).stroke({
        width: 2,
        color: i % 2 ? 0xd8cbff : 0xfff4d4,
        alpha: (1 - local) * 0.8,
      })
    }
    g.circle(ends.to.x, ends.to.y, 10 + Math.sin(this.effects.time * 8) * 2).fill({ color: 0xfff6ea, alpha: 0.9 })
    if (Math.random() < 0.8) this.effects.combat.spawn('cosmic', ends.to.x, ends.to.y, 1, { scale: 1, speed: 1.4 })
    return ends.to
  }

  private sword(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const reveal = easeOutCubic(clamp((t - 0.12) / 0.22, 0, 1))
    const start = { x: live.cmd.team === 'red' ? width * 0.48 : width * 0.52, y: height * 0.2 }
    const end = { x: live.cmd.team === 'red' ? width * 0.9 : width * 0.1, y: height * 0.72 }
    const point = lerp2(start, end, reveal)
    if (t < 0.16) {
      g.circle(start.x, start.y, 8).fill({ color: 0xfff6ea, alpha: 0.35 })
    }
    g.moveTo(start.x, start.y).lineTo(point.x, point.y).stroke({ width: 18, color: 0xe6c98a, alpha: 0.22, cap: 'round' })
    g.moveTo(start.x, start.y).lineTo(point.x, point.y).stroke({ width: 3.5, color: 0xfffaf2, alpha: 0.95, cap: 'round' })
    return point
  }

  private pulse(g: Graphics, live: LiveAttack, t: number, width: number, height: number): { x: number; y: number } {
    const originX = live.cmd.team === 'red' ? width * 0.24 : width * 0.76
    const originY = height * 0.5
    const radius = 20 + easeOutCubic(clamp(t, 0, 1)) * width * 0.28 * live.cmd.intensity
    g.circle(originX, originY, radius).stroke({ width: 2.5, color: teamColor(live.cmd.team), alpha: (1 - t) * 0.75 })
    g.circle(originX, originY, radius * 0.72).stroke({ width: 1.2, color: 0xfff6ea, alpha: (1 - t) * 0.35 })
    return { x: originX, y: originY }
  }

  private resolveHits(live: LiveAttack, t: number, width: number, height: number): void {
    live.cmd.impacts.forEach((at, index) => {
      if (live.fired[index] || t < at) return
      live.fired[index] = true
      const point = this.impactPoint(live, index, width, height)
      const dealt = director.onImpact(live.cmd, point.x / width, point.y / height, index)
      if (index === 0) this.effects.addShake(live.cmd.shake)
      const flash = flashAmount(live.cmd)
      if (index === 0 && flash > 0) this.effects.punch(flashColor(live.cmd), flash)
      this.effects.spawnDamage(point.x, point.y - 16, dealt)
      this.impactBurst(live.cmd.attackType, point.x, point.y, live.cmd.intensity)
    })
  }

  private impactPoint(live: LiveAttack, index: number, width: number, height: number): { x: number; y: number } {
    if (live.cmd.attackType === 'dragon') {
      return sweepPoint(live.cmd.team, live.cmd.impacts[index] ?? 0.5, width, height)
    }
    if (live.cmd.attackType === 'sword') {
      return {
        x: live.cmd.team === 'red' ? width * 0.72 : width * 0.28,
        y: height * 0.48,
      }
    }
    const spread = (index - (live.cmd.impacts.length - 1) / 2) * 46
    return {
      x: live.cmd.toX * width + spread,
      y: live.cmd.toY * height + (index % 2) * 30 - 10,
    }
  }

  private impactBurst(type: AttackType, x: number, y: number, intensity: number): void {
    const scale = 0.7 + Math.min(1.4, intensity) * 0.45
    const n = Math.min(28, Math.round(6 + intensity * 8))
    switch (type) {
      case 'rose':
        this.effects.combat.spawn('petal', x, y, n + 6, { scale })
        break
      case 'heart':
        this.effects.combat.spawn('heart', x, y, Math.min(16, n), { scale })
        break
      case 'fireball':
      case 'fire_blast':
      case 'firestorm':
      case 'dragon':
        this.effects.combat.spawn('fire', x, y, n, { scale })
        this.effects.combat.spawn('smoke', x, y, 4, { scale })
        break
      case 'lightning':
      case 'thunderstorm':
      case 'laser':
      case 'beam':
        this.effects.combat.spawn('electric', x, y, n, { scale })
        break
      case 'rocket':
      case 'missile':
      case 'airstrike':
      case 'meteor':
        this.effects.combat.spawn('explosion', x, y, n, { scale: scale * 1.2 })
        this.effects.combat.spawn('smoke', x, y, 6, { scale })
        break
      case 'tornado':
        this.effects.combat.spawn('smoke', x, y, 5, { scale })
        this.effects.combat.spawn('spark', x, y, 4, { scale })
        break
      case 'black_hole':
      case 'cosmic':
        this.effects.combat.spawn('cosmic', x, y, n, { scale })
        this.effects.combat.spawn('gold', x, y, 6, { scale })
        break
      case 'sword':
        this.effects.combat.spawn('spark', x, y, n, { color: 0xfff3d0, scale })
        this.effects.combat.spawn('gold', x, y, 8, { scale })
        break
      case 'sparkle_shot':
        this.effects.combat.spawn('spark', x, y, n, { color: 0xfff6d2, scale })
        break
      case 'magic':
        this.effects.combat.spawn('cosmic', x, y, 8, { scale: 0.7 })
        break
      default:
        this.effects.combat.spawn('spark', x, y, 5, { scale: 0.7 })
        break
    }
  }

  private trail(g: Graphics, live: LiveAttack, color: number, radius: number): void {
    live.history.forEach((point, index) => {
      const fade = (index + 1) / live.history.length
      g.circle(point.x, point.y, radius * fade).fill({ color, alpha: 0.18 * fade })
    })
  }
}

function teamColor(team: TeamId): number {
  return team === 'red' ? teamPalette.red : teamPalette.blue
}

function endsOf(live: LiveAttack, width: number, height: number): { from: { x: number; y: number }; to: { x: number; y: number } } {
  return {
    from: { x: live.cmd.fromX * width, y: live.cmd.fromY * height },
    to: { x: live.cmd.toX * width, y: live.cmd.toY * height },
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerp2(a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

function perpendicular(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

function sweepPoint(team: TeamId, t: number, width: number, height: number): { x: number; y: number } {
  const startX = team === 'red' ? width * 0.46 : width * 0.54
  const endX = team === 'red' ? width * 0.9 : width * 0.1
  return {
    x: lerp(startX, endX, t),
    y: height * (0.42 + Math.sin(t * Math.PI * 2) * 0.1),
  }
}

function flashAmount(cmd: AttackCommand): number {
  if (cmd.rarity === 'legendary') return 0.38
  if (cmd.rarity === 'large') return 0.16
  if (cmd.rarity === 'medium') return 0.07
  return 0
}

function flashColor(cmd: AttackCommand): number {
  if (cmd.attackType === 'meteor' || cmd.attackType === 'sword') return 0xfff3d2
  if (cmd.attackType === 'lightning' || cmd.attackType === 'thunderstorm') return 0xd7e8ff
  if (cmd.attackType === 'black_hole' || cmd.attackType === 'cosmic') return 0xefe8ff
  return cmd.team === 'red' ? 0xffd0d8 : 0xd5e6ff
}
