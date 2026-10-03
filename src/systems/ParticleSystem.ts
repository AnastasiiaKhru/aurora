import type { ParticlePreset } from '../types/Events.ts'

export interface Particle {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: number
  drag: number
  gravity: number
  rot: number
  spin: number
  preset: ParticlePreset
  additive: boolean
}

export interface ParticleSpawn {
  scale?: number
  color?: number
  speed?: number
  spread?: number
  angle?: number
}

function makeParticle(): Particle {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    max: 1,
    size: 2,
    color: 0xffffff,
    drag: 0.4,
    gravity: 0,
    rot: 0,
    spin: 0,
    preset: 'spark',
    additive: true,
  }
}

export class ParticleField {
  readonly pool: Particle[]
  count = 0
  private cursor = 0

  constructor(max: number) {
    this.pool = Array.from({ length: max }, () => makeParticle())
  }

  spawn(preset: ParticlePreset, x: number, y: number, amount: number, options: ParticleSpawn = {}): void {
    const n = Math.max(0, Math.floor(amount))
    for (let i = 0; i < n; i += 1) {
      const particle = this.pool[this.cursor]!
      this.cursor = (this.cursor + 1) % this.pool.length
      paint(particle, preset, x, y, options)
    }
  }

  update(dt: number): void {
    let alive = 0
    for (const particle of this.pool) {
      if (!particle.active) continue
      particle.life -= dt
      if (particle.life <= 0) {
        particle.active = false
        continue
      }
      const drag = Math.max(0, 1 - particle.drag * dt)
      particle.vx *= drag
      particle.vy = particle.vy * drag + particle.gravity * dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.rot += particle.spin * dt
      alive += 1
    }
    this.count = alive
  }

  clear(): void {
    for (const particle of this.pool) particle.active = false
    this.count = 0
  }
}

function paint(particle: Particle, preset: ParticlePreset, x: number, y: number, options: ParticleSpawn): void {
  const scale = options.scale ?? 1
  const spread = options.spread ?? 1
  const angle = options.angle ?? Math.random() * Math.PI * 2
  const speed = (options.speed ?? 1) * (40 + Math.random() * 80)
  particle.active = true
  particle.preset = preset
  particle.x = x + (Math.random() - 0.5) * 8 * spread
  particle.y = y + (Math.random() - 0.5) * 8 * spread
  particle.vx = Math.cos(angle) * speed * spread
  particle.vy = Math.sin(angle) * speed * spread
  particle.rot = Math.random() * Math.PI
  particle.spin = (Math.random() - 0.5) * 4
  particle.additive = preset !== 'smoke' && preset !== 'confetti'
  particle.color = options.color ?? 0xffffff

  switch (preset) {
    case 'ember':
      particle.life = particle.max = 1.1 + Math.random() * 1.1
      particle.size = (2.4 + Math.random() * 2.8) * scale
      particle.gravity = -22
      particle.drag = 0.5
      particle.vx = (Math.random() - 0.5) * 18
      particle.vy = -24 - Math.random() * 36
      particle.color = options.color ?? (Math.random() > 0.5 ? 0xff6a45 : 0xffc49a)
      break
    case 'electric':
      particle.life = particle.max = 0.35 + Math.random() * 0.35
      particle.size = (1.6 + Math.random() * 2) * scale
      particle.gravity = 0
      particle.drag = 2.2
      particle.color = options.color ?? (Math.random() > 0.4 ? 0xd7ecff : 0x7eb6ff)
      break
    case 'smoke':
      particle.life = particle.max = 0.7 + Math.random() * 0.6
      particle.size = (6 + Math.random() * 10) * scale
      particle.gravity = -10
      particle.drag = 1.4
      particle.vx *= 0.25
      particle.vy = -16 - Math.random() * 20
      particle.color = options.color ?? 0x2a241f
      particle.additive = false
      break
    case 'fire':
      particle.life = particle.max = 0.35 + Math.random() * 0.35
      particle.size = (2.5 + Math.random() * 4) * scale
      particle.gravity = -40
      particle.drag = 1.1
      particle.color = options.color ?? (Math.random() > 0.5 ? 0xff8a3d : 0xffe1a8)
      break
    case 'ice':
      particle.life = particle.max = 0.7 + Math.random() * 0.5
      particle.size = (1.2 + Math.random() * 2) * scale
      particle.gravity = 12
      particle.drag = 0.4
      particle.vx = (Math.random() - 0.5) * 30
      particle.vy = -10 - Math.random() * 24
      particle.color = options.color ?? 0xd5eeff
      break
    case 'gold':
      particle.life = particle.max = 0.7 + Math.random() * 0.7
      particle.size = (1.6 + Math.random() * 2.2) * scale
      particle.gravity = 30
      particle.drag = 0.5
      particle.color = options.color ?? (Math.random() > 0.5 ? 0xf0d48a : 0xfff6d2)
      break
    case 'heart':
      particle.life = particle.max = 0.7 + Math.random() * 0.45
      particle.size = (4 + Math.random() * 5) * scale
      particle.gravity = -16
      particle.drag = 0.8
      particle.vx = (Math.random() - 0.5) * 40
      particle.vy = -20 - Math.random() * 30
      particle.color = options.color ?? 0xff8ea4
      break
    case 'petal':
      particle.life = particle.max = 0.9 + Math.random() * 0.8
      particle.size = (4 + Math.random() * 4) * scale
      particle.gravity = 22
      particle.drag = 0.7
      particle.vx = (Math.random() - 0.5) * 50
      particle.vy = -10 + Math.random() * 30
      particle.spin = (Math.random() - 0.5) * 6
      particle.color = options.color ?? (Math.random() > 0.5 ? 0xff4d67 : 0xffb3c0)
      break
    case 'cosmic':
      particle.life = particle.max = 0.55 + Math.random() * 0.5
      particle.size = (1.3 + Math.random() * 2.2) * scale
      particle.gravity = 0
      particle.drag = 0.9
      particle.color = options.color ?? (Math.random() > 0.5 ? 0xd8cbff : 0xfff4d2)
      break
    case 'explosion':
      particle.life = particle.max = 0.35 + Math.random() * 0.35
      particle.size = (2 + Math.random() * 4.5) * scale
      particle.gravity = 20
      particle.drag = 1.5
      particle.color = options.color ?? (Math.random() > 0.35 ? 0xfff1d0 : 0xff7a45)
      break
    case 'confetti':
      particle.life = particle.max = 1.4 + Math.random() * 1.1
      particle.size = (3 + Math.random() * 3) * scale
      particle.gravity = 70
      particle.drag = 0.2
      particle.vx = (Math.random() - 0.5) * 180
      particle.vy = -120 - Math.random() * 160
      particle.spin = (Math.random() - 0.5) * 8
      particle.additive = false
      particle.color = options.color ?? [0xe6c98a, 0xfff6ea, 0xff4b63, 0x3d8dff, 0xffffff][Math.floor(Math.random() * 5)]!
      break
    case 'spark':
    default:
      particle.life = particle.max = 0.28 + Math.random() * 0.3
      particle.size = (1.2 + Math.random() * 1.8) * scale
      particle.gravity = 0
      particle.drag = 1.6
      particle.color = options.color ?? 0xfff6ea
      break
  }
}
