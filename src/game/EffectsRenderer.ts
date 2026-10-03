import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import { teamPalette } from '../config/effectConfig.ts'
import { battleConfig } from '../config/battleConfig.ts'
import { riftTarget } from '../systems/BattleSystem.ts'
import { director } from '../systems/GameDirector.ts'
import { ParticleField } from '../systems/ParticleSystem.ts'
import type { ShakeLevel } from '../types/Gift.ts'
import { formatDamage } from '../utils/format.ts'
import { shakeAmount } from '../config/effectConfig.ts'
import { renderParticles } from './draw.ts'

interface Floater {
  node: Text
  age: number
  life: number
  vy: number
  x: number
  y: number
}

const damageStyles = {
  small: new TextStyle({ fontFamily: 'Outfit, sans-serif', fontSize: 15, fill: 0xfff8f2, fontWeight: '600' }),
  mid: new TextStyle({ fontFamily: 'Outfit, sans-serif', fontSize: 22, fill: 0xfff8f2, fontWeight: '700' }),
  large: new TextStyle({ fontFamily: 'Outfit, sans-serif', fontSize: 32, fill: 0xfff4d4, fontWeight: '800' }),
  huge: new TextStyle({ fontFamily: 'Syne, Outfit, sans-serif', fontSize: 44, fill: 0xfff1c9, fontWeight: '800' }),
}

function glowTexture(inner: string): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.EMPTY
  const gradient = ctx.createRadialGradient(256, 256, 8, 256, 256, 250)
  gradient.addColorStop(0, inner)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 512)
  return Texture.from(canvas)
}

function atmosphereTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.EMPTY
  const mid = ctx.createLinearGradient(0, 0, 512, 0)
  mid.addColorStop(0, 'rgba(7,8,13,0.12)')
  mid.addColorStop(0.32, 'rgba(7,8,13,0)')
  mid.addColorStop(0.5, 'rgba(7,8,13,0.62)')
  mid.addColorStop(0.68, 'rgba(7,8,13,0)')
  mid.addColorStop(1, 'rgba(7,8,13,0.12)')
  ctx.fillStyle = mid
  ctx.fillRect(0, 0, 512, 512)
  const vert = ctx.createLinearGradient(0, 0, 0, 512)
  vert.addColorStop(0, 'rgba(5,6,10,0.58)')
  vert.addColorStop(0.18, 'rgba(5,6,10,0.08)')
  vert.addColorStop(0.74, 'rgba(5,6,10,0)')
  vert.addColorStop(1, 'rgba(5,6,10,0.66)')
  ctx.fillStyle = vert
  ctx.fillRect(0, 0, 512, 512)
  return Texture.from(canvas)
}

function fitInside(sprite: Sprite, cx: number, cy: number, boxWidth: number, boxHeight: number, pulse: number): void {
  const frame = sprite.texture
  if (frame === Texture.EMPTY || frame.width <= 1 || frame.height <= 1) return
  const scale = Math.min(boxWidth / frame.width, boxHeight / frame.height) * pulse
  sprite.scale.set(scale)
  sprite.position.set(cx, cy)
}

function vignetteTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.EMPTY
  const gradient = ctx.createRadialGradient(256, 240, 80, 256, 256, 340)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(0.72, 'rgba(0,0,0,0.18)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.72)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 512)
  return Texture.from(canvas)
}

export class EffectsRenderer {
  readonly world = new Container()
  readonly playerLayer = new Container()
  readonly attackGfx = new Graphics()
  readonly ambient = new ParticleField(battleConfig.maxAmbientParticles)
  readonly combat = new ParticleField(battleConfig.maxCombatParticles)
  time = 0
  rift = 0.5
  private trauma = 0
  private flash = 0
  private flashColor = 0xffffff
  private streak = 0
  private streakY = 0.4
  private celebrated = false
  private reduceMotion = false
  private sized = ''
  private readonly base = new Graphics()
  private readonly riftGfx = new Graphics()
  private readonly ambientAdd = new Graphics()
  private readonly ambientNormal = new Graphics()
  private readonly combatAdd = new Graphics()
  private readonly combatNormal = new Graphics()
  private readonly flashGfx = new Graphics()
  private readonly dark = new Graphics()
  private readonly damageLayer = new Container()
  private readonly redFigure: Sprite
  private readonly blueFigure: Sprite
  private readonly redMask = new Graphics()
  private readonly blueMask = new Graphics()
  private readonly atmosphere: Sprite
  private readonly redGlow: Sprite
  private readonly blueGlow: Sprite
  private readonly vignette: Sprite
  private readonly floaters: Floater[] = []
  private readonly textPool: Text[] = []

  constructor() {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.redFigure = new Sprite(Texture.EMPTY)
    this.blueFigure = new Sprite(Texture.EMPTY)
    this.atmosphere = new Sprite(atmosphereTexture())
    this.redGlow = new Sprite(glowTexture('rgba(255, 70, 98, 0.95)'))
    this.blueGlow = new Sprite(glowTexture('rgba(80, 150, 255, 0.9)'))
    this.vignette = new Sprite(vignetteTexture())
    this.redFigure.anchor.set(0.5)
    this.blueFigure.anchor.set(0.5)
    this.atmosphere.anchor.set(0.5)
    this.redGlow.anchor.set(0.5)
    this.blueGlow.anchor.set(0.5)
    this.vignette.anchor.set(0.5)
    void Assets.load<Texture>('/god-red.jpg')
      .then((texture) => {
        this.redFigure.texture = texture
      })
      .catch((error: unknown) => {
        console.error(error)
      })
    void Assets.load<Texture>('/devil-blue.jpg')
      .then((texture) => {
        this.blueFigure.texture = texture
      })
      .catch((error: unknown) => {
        console.error(error)
      })
    this.ambientAdd.blendMode = 'add'
    this.combatAdd.blendMode = 'add'
    this.flashGfx.blendMode = 'add'
    this.playerLayer.sortableChildren = true
  }

  mount(stage: Container): void {
    const overlay = new Container()
    this.redFigure.mask = this.redMask
    this.blueFigure.mask = this.blueMask
    this.world.addChild(this.base)
    this.world.addChild(this.redMask)
    this.world.addChild(this.blueMask)
    this.world.addChild(this.redFigure)
    this.world.addChild(this.blueFigure)
    this.world.addChild(this.atmosphere)
    this.world.addChild(this.redGlow)
    this.world.addChild(this.blueGlow)
    this.world.addChild(this.ambientAdd)
    this.world.addChild(this.ambientNormal)
    this.world.addChild(this.riftGfx)
    this.world.addChild(this.playerLayer)
    this.world.addChild(this.attackGfx)
    this.world.addChild(this.combatAdd)
    this.world.addChild(this.combatNormal)
    this.world.addChild(this.damageLayer)
    this.world.addChild(this.flashGfx)
    overlay.addChild(this.vignette)
    overlay.addChild(this.dark)
    stage.addChild(this.world)
    stage.addChild(overlay)
  }

  update(dt: number, width: number, height: number): void {
    this.time += dt
    const target = riftTarget(director.battle.red, director.battle.blue)
    this.rift += (target - this.rift) * (1 - Math.exp(-dt * 2.4))
    this.layoutGlows(width, height)
    this.layoutFigures(width, height)
    this.drawBase(width, height)
    this.drawRift(width, height)
    this.spawnAmbient(dt, width, height)
    this.ambient.update(dt)
    this.combat.update(dt)
    this.ambientAdd.clear()
    this.ambientNormal.clear()
    this.combatAdd.clear()
    this.combatNormal.clear()
    renderParticles(this.ambient, this.ambientAdd, this.ambientNormal)
    renderParticles(this.combat, this.combatAdd, this.combatNormal)
    this.updateFloaters(dt)
    this.updateFlash(dt, width, height)
    this.updateDark(width, height)
    this.celebrate(width, height)
  }

  addShake(level: ShakeLevel): void {
    const amount = shakeAmount[level] * (this.reduceMotion ? 0.2 : 1)
    this.trauma = Math.min(1, this.trauma + amount)
  }

  shakeOffset(dt: number): { x: number; y: number } {
    const power = this.trauma * this.trauma
    this.trauma = Math.max(0, this.trauma - dt * 1.65)
    return {
      x: Math.sin(this.time * 46) * power * 16,
      y: Math.cos(this.time * 55) * power * 11,
    }
  }

  punch(color: number, amount: number): void {
    this.flashColor = color
    this.flash = Math.max(this.flash, amount)
  }

  spawnDamage(x: number, y: number, amount: number): void {
    if (amount <= 0) return
    const node = this.textPool.pop() ?? new Text({ text: '', style: damageStyles.small })
    node.anchor.set(0.5)
    node.text = formatDamage(amount)
    node.style = amount >= 15_000 ? damageStyles.huge : amount >= 1_500 ? damageStyles.large : amount >= 250 ? damageStyles.mid : damageStyles.small
    node.visible = true
    node.position.set(x, y)
    this.damageLayer.addChild(node)
    this.floaters.push({
      node,
      age: 0,
      life: amount >= 1_500 ? 1.2 : 0.95,
      vy: amount >= 1_500 ? -62 : -40,
      x,
      y,
    })
  }

  reset(): void {
    this.ambient.clear()
    this.combat.clear()
    this.flash = 0
    this.trauma = 0
    this.celebrated = false
    this.rift = 0.5
    for (const floater of this.floaters) this.release(floater)
    this.floaters.length = 0
  }

  private layoutGlows(width: number, height: number): void {
    const phase = director.battle.phase
    const boost = phase === 'final_10' ? 0.18 : phase === 'final_rush' ? 0.1 : 0
    const redRush = director.momentum.rush?.team === 'red' ? 0.16 : 0
    const blueRush = director.momentum.rush?.team === 'blue' ? 0.16 : 0
    this.redGlow.position.set(width * (0.2 + Math.sin(this.time * 0.17) * 0.02), height * (0.46 + Math.cos(this.time * 0.13) * 0.02))
    this.blueGlow.position.set(width * (0.8 + Math.cos(this.time * 0.15) * 0.02), height * (0.5 + Math.sin(this.time * 0.12) * 0.025))
    this.redGlow.width = width * 1.05
    this.redGlow.height = height * 0.92
    this.blueGlow.width = width * 1.05
    this.blueGlow.height = height * 0.92
    this.redGlow.alpha = 0.16 + Math.sin(this.time * 0.9) * 0.03 + director.battle.red.momentum * 0.18 + director.teamFlash.red * 0.28 + boost + redRush
    this.blueGlow.alpha = 0.16 + Math.cos(this.time * 0.8) * 0.03 + director.battle.blue.momentum * 0.18 + director.teamFlash.blue * 0.28 + boost + blueRush
    this.vignette.position.set(width / 2, height / 2)
    this.vignette.width = width * 1.08
    this.vignette.height = height * 1.08
  }

  private layoutFigures(width: number, height: number): void {
    const pulse = this.reduceMotion ? 1 : 1 + Math.sin(this.time * 0.22) * 0.008
    const half = width * 0.5
    this.redMask.clear()
    this.blueMask.clear()
    this.redMask.rect(0, 0, half, height).fill({ color: 0xffffff })
    this.blueMask.rect(half, 0, half, height).fill({ color: 0xffffff })
    fitInside(this.redFigure, half * 0.5, height * 0.46, half, height * 0.92, pulse)
    fitInside(this.blueFigure, half * 1.5, height * 0.46, half, height * 0.92, pulse)
    this.redFigure.alpha = 0.94
    this.blueFigure.alpha = 0.94
    this.atmosphere.position.set(width / 2, height / 2)
    this.atmosphere.width = width
    this.atmosphere.height = height
  }

  private drawBase(width: number, height: number): void {
    this.base.clear()
    this.base.rect(0, 0, width, height).fill({ color: 0x07080d })
    this.base.rect(0, 0, width * 0.5, height).fill({ color: 0x2a0c14, alpha: 0.28 })
    this.base.rect(width * 0.5, 0, width * 0.5, height).fill({ color: 0x0b1528, alpha: 0.3 })
    this.base.ellipse(width * 0.24, height * 0.86, width * 0.28, height * 0.08).fill({ color: teamPalette.red, alpha: 0.05 })
    this.base.ellipse(width * 0.76, height * 0.86, width * 0.28, height * 0.08).fill({ color: teamPalette.blue, alpha: 0.05 })
  }

  private drawRift(width: number, height: number): void {
    const x = this.rift * width
    const phase = director.battle.phase
    const energy = phase === 'final_10' ? 1.55 : phase === 'final_rush' ? 1.25 : 1
    this.riftGfx.clear()
    this.riftGfx.rect(x - 46, height * 0.08, 92, height * 0.84).fill({ color: 0xfff6ea, alpha: 0.045 * energy })
    this.riftGfx.circle(x, height * 0.5, 70 + Math.sin(this.time * 1.4) * 8).fill({ color: 0xfff4e8, alpha: 0.05 * energy })
    for (let i = 0; i < 9; i += 1) {
      const pts: number[] = []
      const offset = (i - 4) * 4.2
      const steps = 28
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps
        const y = height * 0.1 + t * height * 0.8
        const wave = Math.sin(t * 8 + this.time * (1.5 + i * 0.12) + i) * (12 + energy * 10)
        const slow = Math.sin(t * 3.2 - this.time * 0.8 + i) * 7
        pts.push(x + offset * 0.35 + wave + slow, y)
      }
      const core = i === 4
      strokePathSafe(this.riftGfx, pts, core ? 4.5 : 1.4, core ? 0xfff8ef : i % 2 ? 0xffc7d2 : 0xd4e6ff, core ? 0.95 : 0.38)
    }
    const beads = 6
    for (let i = 0; i < beads; i += 1) {
      const t = (this.time * 0.18 + i / beads) % 1
      const y = height * 0.12 + t * height * 0.74
      this.riftGfx.circle(x + Math.sin(this.time * 2 + i) * 8, y, 2.2).fill({ color: 0xfff6ea, alpha: 0.85 })
    }
    if (this.streak <= 0 && Math.random() < 0.004) {
      this.streak = 1.15
      this.streakY = 0.18 + Math.random() * 0.55
    }
    if (this.streak > 0) {
      const t = 1 - this.streak / 1.15
      const sx = -width * 0.15 + width * 1.3 * t
      this.riftGfx.roundRect(sx, height * this.streakY, width * 0.22, 1.4, 2).fill({ color: 0xfff8ee, alpha: Math.sin(Math.PI * t) * 0.22 })
      this.streak -= 1 / 60
    }
  }

  private spawnAmbient(dt: number, width: number, height: number): void {
    if (this.ambient.count > battleConfig.maxAmbientParticles - 20) return
    const phase = director.battle.phase
    const rush = phase === 'final_10' ? 1.8 : phase === 'final_rush' ? 1.25 : 1
    const redRate = (0.55 + director.battle.red.momentum) * rush * (director.momentum.rush?.team === 'red' ? 1.7 : 1)
    const blueRate = (0.55 + director.battle.blue.momentum) * rush * (director.momentum.rush?.team === 'blue' ? 1.7 : 1)
    if (Math.random() < dt * 28 * redRate) {
      this.ambient.spawn('ember', Math.random() * width * 0.42, height * (0.28 + Math.random() * 0.62), 1, { scale: 1.35 })
    }
    if (Math.random() < dt * 28 * blueRate) {
      this.ambient.spawn(Math.random() > 0.45 ? 'electric' : 'ice', width * (0.58 + Math.random() * 0.38), height * (0.18 + Math.random() * 0.68), 1, { scale: 1.25 })
    }
    if (Math.random() < dt * 18 * rush) {
      this.ambient.spawn('spark', this.rift * width + (Math.random() - 0.5) * 18, height * (0.16 + Math.random() * 0.68), 1, {
        color: 0xfff6ea,
        speed: 0.55,
        scale: 1.2,
      })
    }
  }

  private updateFloaters(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const floater = this.floaters[i]!
      floater.age += dt
      const t = floater.age / floater.life
      floater.y += floater.vy * dt
      floater.vy *= 0.98
      const pop = t < 0.18 ? 0.72 + (t / 0.18) * 0.48 : 1.08 - (t - 0.18) * 0.12
      floater.node.position.set(floater.x, floater.y)
      floater.node.scale.set(Math.max(0.7, pop))
      floater.node.alpha = t < 0.12 ? t / 0.12 : t > 0.68 ? Math.max(0, 1 - (t - 0.68) / 0.32) : 1
      if (t >= 1) {
        this.release(floater)
        this.floaters.splice(i, 1)
      }
    }
  }

  private updateFlash(dt: number, width: number, height: number): void {
    this.flashGfx.clear()
    if (this.flash > 0.01) {
      this.flashGfx.rect(0, 0, width, height).fill({ color: this.flashColor, alpha: this.flash })
      this.flash = Math.max(0, this.flash - dt * 1.8)
    }
  }

  private updateDark(width: number, height: number): void {
    const key = `${Math.round(width)}x${Math.round(height)}`
    if (key !== this.sized) {
      this.dark.clear()
      this.dark.rect(0, 0, width, height).fill({ color: 0x04050a })
      this.sized = key
    }
    this.dark.alpha = director.cinematic
  }

  private celebrate(width: number, height: number): void {
    if (director.battle.victory && !this.celebrated) {
      this.celebrated = true
      const color = director.battle.victory.result === 'blue' ? teamPalette.blue : director.battle.victory.result === 'red' ? teamPalette.red : teamPalette.gold
      this.combat.spawn('confetti', width * 0.5, height * 0.28, 70, { color })
      this.combat.spawn('gold', width * 0.5, height * 0.34, 36)
      this.punch(0xfff3d2, 0.18)
    }
    if (!director.battle.victory) this.celebrated = false
  }

  private release(floater: Floater): void {
    floater.node.removeFromParent()
    floater.node.visible = false
    if (this.textPool.length < 40) this.textPool.push(floater.node)
    else floater.node.destroy()
  }
}

function strokePathSafe(g: Graphics, pts: number[], width: number, color: number, alpha: number): void {
  if (pts.length < 4) return
  g.moveTo(pts[0]!, pts[1]!)
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!)
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' })
}
