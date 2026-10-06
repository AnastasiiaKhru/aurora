import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import { DESIGN_HEIGHT, DESIGN_WIDTH, GAMEPLAY_END, TOP_SAFE_ZONE, renderResolution, stageY } from '../broadcast/stage.ts'
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
  small: new TextStyle({ fontFamily: 'Outfit, sans-serif', fontSize: 15, fill: 0xf4f7fb, fontWeight: '600' }),
  mid: new TextStyle({ fontFamily: 'Outfit, sans-serif', fontSize: 22, fill: 0xffe8ec, fontWeight: '700' }),
  large: new TextStyle({ fontFamily: 'Outfit, sans-serif', fontSize: 32, fill: 0xdceaff, fontWeight: '800' }),
  huge: new TextStyle({ fontFamily: 'Oswald, Outfit, sans-serif', fontSize: 44, fill: 0xffffff, fontWeight: '600' }),
}

function glowTexture(core: string, mid: string): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.EMPTY
  const gradient = ctx.createRadialGradient(256, 256, 70, 256, 256, 255)
  gradient.addColorStop(0, core)
  gradient.addColorStop(0.42, mid)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 512)
  return Texture.from(canvas)
}

function atmosphereTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 912
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.EMPTY
  const sky = ctx.createLinearGradient(0, 0, 512, 0)
  sky.addColorStop(0, 'rgba(255, 208, 220, 0.72)')
  sky.addColorStop(0.2, 'rgba(255, 70, 104, 0.34)')
  sky.addColorStop(0.46, 'rgba(255, 255, 255, 0.2)')
  sky.addColorStop(0.54, 'rgba(255, 255, 255, 0.18)')
  sky.addColorStop(0.8, 'rgba(45, 110, 255, 0.36)')
  sky.addColorStop(1, 'rgba(213, 228, 255, 0.7)')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 512, 640)
  const aurora = ctx.createLinearGradient(0, 40, 180, 520)
  aurora.addColorStop(0, 'rgba(255,255,255,0.55)')
  aurora.addColorStop(0.4, 'rgba(255,80,120,0.18)')
  aurora.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = aurora
  ctx.fillRect(0, 0, 250, 600)
  const stars = ctx.createLinearGradient(320, 30, 512, 540)
  stars.addColorStop(0, 'rgba(255,255,255,0.4)')
  stars.addColorStop(0.45, 'rgba(80,140,255,0.16)')
  stars.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = stars
  ctx.fillRect(280, 0, 232, 600)
  const floor = ctx.createLinearGradient(0, 500, 0, 912)
  floor.addColorStop(0, 'rgba(12, 16, 28, 0)')
  floor.addColorStop(0.28, 'rgba(12, 16, 28, 0.1)')
  floor.addColorStop(0.62, 'rgba(10, 14, 24, 0.28)')
  floor.addColorStop(1, 'rgba(8, 12, 20, 0.48)')
  ctx.fillStyle = floor
  ctx.fillRect(0, 480, 512, 432)
  return Texture.from(canvas)
}

const softSky = atmosphereTexture()

function vignetteTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.EMPTY
  const gradient = ctx.createRadialGradient(256, 240, 80, 256, 256, 340)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(0.72, 'rgba(0,0,0,0.02)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.12)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 512)
  return Texture.from(canvas)
}

export class EffectsRenderer {
  readonly world = new Container()
  readonly playerLayer = new Container()
  readonly attackGfx = new Graphics()
  readonly glowGfx = new Graphics()
  private readonly playClip = new Graphics()
  readonly combat = new ParticleField(battleConfig.maxCombatParticles)
  time = 0
  rift = 0.5
  private trauma = 0
  private flash = 0
  private flashColor = 0xffffff
  private celebrated = false
  private reduceMotion = false
  private sized = ''
  private readonly base = new Graphics()
  private readonly riftGfx = new Graphics()
  private readonly combatAdd = new Graphics()
  private readonly combatNormal = new Graphics()
  private readonly flashGfx = new Graphics()
  private readonly dark = new Graphics()
  private readonly damageLayer = new Container()
  private readonly backdrop: Sprite
  private readonly atmosphere: Sprite
  private readonly redGlow: Sprite
  private readonly blueGlow: Sprite
  private readonly vignette: Sprite
  private readonly floaters: Floater[] = []
  private readonly textPool: Text[] = []

  constructor() {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.backdrop = new Sprite(Texture.EMPTY)
    this.atmosphere = new Sprite(softSky)
    this.redGlow = new Sprite(glowTexture('rgba(225, 36, 72, 0.42)', 'rgba(180, 24, 58, 0.16)'))
    this.blueGlow = new Sprite(glowTexture('rgba(46, 130, 255, 0.4)', 'rgba(70, 190, 255, 0.14)'))
    this.redGlow.blendMode = 'add'
    this.blueGlow.blendMode = 'add'
    this.vignette = new Sprite(vignetteTexture())
    this.backdrop.anchor.set(0.5, 0.58)
    this.backdrop.roundPixels = false
    this.atmosphere.anchor.set(0.5)
    this.redGlow.anchor.set(0.5)
    this.blueGlow.anchor.set(0.5)
    this.vignette.anchor.set(0.5)
    const photo = new Image()
    photo.onload = () => {
      const sourceW = Math.max(1, photo.naturalWidth)
      const sourceH = Math.max(1, photo.naturalHeight)
      const cover = Math.max(DESIGN_WIDTH / sourceW, DESIGN_HEIGHT / sourceH)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(DESIGN_WIDTH, Math.round(sourceW * cover))
      canvas.height = Math.max(DESIGN_HEIGHT, Math.round(sourceH * cover))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(photo, 0, 0, canvas.width, canvas.height)
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = frame.data
      for (let i = 0; i < data.length; i += 4) {
        const lifted = [expose(data[i]!), expose(data[i + 1]!), expose(data[i + 2]!)]
        const gray = lifted[0]! * 0.3 + lifted[1]! * 0.59 + lifted[2]! * 0.11
        const sat = 1.16
        data[i] = Math.min(255, gray + (lifted[0]! - gray) * sat)
        data[i + 1] = Math.min(255, gray + (lifted[1]! - gray) * sat)
        data[i + 2] = Math.min(255, gray + (lifted[2]! - gray) * sat)
      }
      ctx.putImageData(frame, 0, 0)
      const graded = Texture.from(canvas)
      graded.source.scaleMode = 'linear'
      graded.source.autoGenerateMipmaps = false
      graded.source.addressMode = 'clamp-to-edge'
      this.backdrop.texture = graded
    }
    photo.src = '/canada-usa.png'
    this.combatAdd.blendMode = 'add'
    this.flashGfx.blendMode = 'add'
    this.glowGfx.blendMode = 'add'
    this.playerLayer.sortableChildren = true
  }

  mount(stage: Container): void {
    const overlay = new Container()
    this.world.addChild(this.base)
    this.world.addChild(this.backdrop)
    this.world.addChild(this.atmosphere)
    this.world.addChild(this.redGlow)
    this.world.addChild(this.blueGlow)
    this.world.addChild(this.riftGfx)
    this.world.addChild(this.playerLayer)
    this.world.addChild(this.playClip)
    this.world.addChild(this.attackGfx)
    this.world.addChild(this.glowGfx)
    this.playClip.renderable = false
    this.attackGfx.mask = this.playClip
    this.glowGfx.mask = this.playClip
    this.damageLayer.mask = this.playClip
    this.world.addChild(this.combatAdd)
    this.world.addChild(this.combatNormal)
    this.world.addChild(this.damageLayer)
    this.world.addChild(this.flashGfx)
    overlay.addChild(this.vignette)
    overlay.addChild(this.dark)
    stage.addChild(this.world)
    stage.addChild(overlay)
  }

  private viewHeight = 1920

  update(dt: number, width: number, height: number): void {
    this.time += dt
    this.viewHeight = height
    this.playClip.clear()
    this.playClip.rect(0, 0, width, stageY(GAMEPLAY_END, height)).fill({ color: 0xffffff })
    const target = riftTarget(director.battle.red, director.battle.blue)
    this.rift += (target - this.rift) * (1 - Math.exp(-dt * 2.4))
    this.layoutGlows(width, height)
    this.layoutFigures(width, height)
    this.drawBase(width, height)
    this.drawRift(width, height)
    this.combat.update(dt)
    director.meters.particles = this.combat.count
    this.combatAdd.clear()
    this.combatNormal.clear()
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
    if (amount < 20 && this.floaters.length >= 6) return
    const node = this.textPool.pop() ?? new Text({ text: '', style: damageStyles.small })
    node.anchor.set(0.5)
    node.resolution = Math.max(2, renderResolution())
    node.text = formatDamage(amount)
    node.style = amount >= 15_000 ? damageStyles.huge : amount >= 1_500 ? damageStyles.large : amount >= 250 ? damageStyles.mid : damageStyles.small
    node.visible = true
    const placed = Math.min(y, stageY(GAMEPLAY_END - 28, this.viewHeight))
    node.position.set(x, placed)
    this.damageLayer.addChild(node)
    this.floaters.push({
      node,
      age: 0,
      life: amount >= 1_500 ? 1.2 : 0.95,
      vy: amount >= 1_500 ? -62 : -40,
      x,
      y: placed,
    })
  }

  reset(): void {
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
    this.redGlow.position.set(width * (0.24 + Math.sin(this.time * 0.17) * 0.012), height * 0.4)
    this.blueGlow.position.set(width * (0.76 + Math.cos(this.time * 0.15) * 0.012), height * 0.4)
    this.redGlow.width = width * 0.7
    this.redGlow.height = height * 0.48
    this.blueGlow.width = width * 0.7
    this.blueGlow.height = height * 0.48
    this.redGlow.alpha = 0.2 + director.battle.red.momentum * 0.05 + director.teamFlash.red * 0.12 + boost + redRush
    this.blueGlow.alpha = 0.2 + director.battle.blue.momentum * 0.05 + director.teamFlash.blue * 0.12 + boost + blueRush
    this.vignette.position.set(width / 2, height / 2)
    this.vignette.width = width * 1.08
    this.vignette.height = height * 1.08
  }

  private layoutFigures(width: number, height: number): void {
    const frame = this.backdrop.texture
    if (frame === Texture.EMPTY || frame.width <= 1 || frame.height <= 1) {
      this.backdrop.visible = false
      return
    }
    const cover = Math.max(width / frame.width, height / frame.height)
    this.backdrop.visible = true
    this.backdrop.anchor.set(0.5, 0.5)
    this.backdrop.scale.set(cover)
    this.backdrop.position.set(width * 0.5, height * 0.5)
    this.backdrop.tint = 0xffffff
    this.backdrop.alpha = 0.42
    this.backdrop.filters = null
    if (this.atmosphere.texture !== softSky) {
      this.atmosphere.texture = softSky
    }
    this.atmosphere.position.set(width / 2, height / 2)
    this.atmosphere.width = width
    this.atmosphere.height = height
  }

  private drawBase(width: number, height: number): void {
    this.base.clear()
    const floor = height * battleConfig.floorTop
    this.base.rect(0, 0, width * 0.5, height).fill({ color: 0xff5a78 })
    this.base.rect(width * 0.5, 0, width * 0.5, height).fill({ color: 0x3a78ff })
    this.base.rect(width * 0.495, 0, width * 0.01, floor).fill({ color: 0xfff8f2, alpha: 0.85 })
    const redFlash = director.teamFlash.red
    const blueFlash = director.teamFlash.blue
    const specks = [
      { side: -1, color: 0xff315a, count: 5 },
      { side: 1, color: 0x7aa2ff, count: 5 },
      { side: 0, color: 0xf4f7fb, count: 4 },
    ]
    let n = 0
    for (const speck of specks) {
      const extra = speck.side < 0 ? redFlash > 0.2 : speck.side > 0 ? blueFlash > 0.2 : redFlash + blueFlash > 0.35
      const count = speck.count + (extra ? 2 : 0)
      for (let i = 0; i < count; i += 1) {
        const drift = (this.time * 0.018 + n * 0.07) % 1
        const lane = speck.side === 0 ? 0.46 + ((n * 13) % 8) / 100 : speck.side < 0 ? 0.08 + ((n * 17) % 28) / 100 : 0.64 + ((n * 17) % 28) / 100
        const px = width * lane
        const py = height * (0.22 + drift * 0.36)
        const alpha = (0.1 + Math.sin(this.time * 0.7 + n) * 0.04) * (extra ? 1.6 : 1)
        this.base.circle(px, py, 0.7).fill({ color: speck.color, alpha })
        n += 1
      }
    }
    const header = stageY(TOP_SAFE_ZONE, height)
    for (let i = 0; i < 8; i += 1) {
      const drift = (this.time * 0.012 + i * 0.11) % 1
      const px = width * (0.32 + ((i * 17) % 36) / 100)
      const py = header * (0.18 + drift * 0.62)
      const color = i % 2 === 0 ? 0xff8aa0 : 0x9db7ff
      this.base.circle(px, py, 1.1).fill({ color, alpha: 0.08 + Math.sin(this.time * 0.6 + i) * 0.03 })
    }
    this.base.ellipse(width * 0.28, height * 0.42, width * 0.22, height * 0.08).fill({ color: teamPalette.red, alpha: 0.05 })
    this.base.ellipse(width * 0.72, height * 0.42, width * 0.22, height * 0.08).fill({ color: teamPalette.blue, alpha: 0.05 })
    this.base.rect(0, floor, width, height - floor).fill({ color: 0x070910, alpha: 0.46 })
    const quietTop = floor + (height - floor) * 0.22
    this.base.rect(width * 0.55, quietTop, width * 0.45, height - quietTop).fill({ color: 0x05060c, alpha: 0.28 })
    this.territoryHit(width, height, 'red')
    this.territoryHit(width, height, 'blue')
  }

  private territoryHit(width: number, height: number, team: 'red' | 'blue'): void {
    const flash = director.teamFlash[team]
    if (flash < 0.04) return
    const x = width * (team === 'red' ? 0.27 : 0.73)
    const y = height * 0.5
    const color = team === 'red' ? teamPalette.red : teamPalette.blue
    this.base.circle(x, y, 24 + (1 - flash) * width * 0.2).stroke({ width: 3, color, alpha: flash * 0.65 })
    this.base.circle(x, y, 12 + (1 - flash) * width * 0.1).stroke({ width: 1.4, color: 0xfff6ea, alpha: flash * 0.4 })
  }

  private drawRift(width: number, height: number): void {
    this.riftGfx.clear()
    const redFlash = director.teamFlash.red
    const blueFlash = director.teamFlash.blue
    const shove = (redFlash - blueFlash) * width * 0.07
    const surge = Math.max(redFlash, blueFlash)
    const vip = director.cinematic > 0.45 || surge > 0.72
    const floorTop = height * battleConfig.floorTop
    const floorH = height - floorTop
    this.riftGfx.ellipse(width * 0.32, floorTop + floorH * 0.42, width * 0.1, height * 0.008).fill({ color: 0xffffff, alpha: 0.015 })
    for (let i = 0; i < 7; i += 1) {
      const leafX = width * (0.08 + (i % 4) * 0.08)
      const leafY = height * (0.26 + ((i * 3) % 5) * 0.06)
      this.riftGfx.circle(leafX, leafY, 3 + (i % 3)).fill({ color: 0xff4d6d, alpha: 0.16 + Math.sin(this.time + i) * 0.04 })
    }
    for (let i = 0; i < 8; i += 1) {
      const starX = width * (0.62 + (i % 4) * 0.08)
      const starY = height * (0.24 + ((i * 2) % 5) * 0.06)
      this.riftGfx.circle(starX, starY, 1.6).fill({ color: 0xf4f8ff, alpha: 0.35 + Math.sin(this.time * 1.4 + i) * 0.15 })
    }
    const x = this.rift * width + shove
    const top = stageY(TOP_SAFE_ZONE, height)
    const span = Math.max(40, floorTop - top - height * 0.03)
    const ripple = vip ? 8 + surge * 12 : surge > 0.45 ? 4.5 + surge * 6 : 1.15
    const pts: number[] = []
    const steps = 16
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps
      const y = top + t * span
      const wave = Math.sin(t * 11 + this.time * (surge > 0.45 ? 6.5 : 1.1)) * ripple
      pts.push(x + wave, y)
    }
    const left = pts.map((value, index) => (index % 2 === 0 ? value - 1.1 : value))
    const right = pts.map((value, index) => (index % 2 === 0 ? value + 1.1 : value))
    strokePathSafe(this.riftGfx, left, 1.15, teamPalette.red, 0.42)
    strokePathSafe(this.riftGfx, right, 1.15, teamPalette.blue, 0.42)
    strokePathSafe(this.riftGfx, pts, 0.7, 0xf4f7fb, 0.9)
    for (let i = 0; i < 4; i += 1) {
      const t = (this.time * 0.16 + i / 4) % 1
      const y = top + t * span
      this.riftGfx.circle(x + Math.sin(t * 12 + this.time) * 0.6, y, 0.65).fill({ color: 0xf4f7fb, alpha: 0.45 })
    }
    if (redFlash > 0.08) {
      const reach = width * (0.04 + redFlash * (vip ? 0.16 : 0.08))
      this.riftGfx.rect(x, height * 0.46, reach, 1.2).fill({ color: teamPalette.red, alpha: 0.35 + redFlash * 0.4 })
      this.riftGfx.circle(x + reach, height * 0.46, 1.4 + redFlash * 2).fill({ color: 0xffd0dc, alpha: redFlash * 0.7 })
    }
    if (blueFlash > 0.08) {
      const reach = width * (0.04 + blueFlash * (vip ? 0.16 : 0.08))
      this.riftGfx.rect(x - reach, height * 0.54, reach, 1.2).fill({ color: teamPalette.blue, alpha: 0.35 + blueFlash * 0.4 })
      this.riftGfx.circle(x - reach, height * 0.54, 1.4 + blueFlash * 2).fill({ color: teamPalette.blueIce, alpha: blueFlash * 0.7 })
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
      this.flashGfx.circle(width * 0.5, height * 0.22, Math.min(width, height) * 0.12).fill({ color: this.flashColor, alpha: this.flash * 0.4 })
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
    this.dark.alpha = Math.min(0.16, director.cinematic * 0.28)
  }

  private celebrate(width: number, height: number): void {
    const victory = director.battle.victory
    if (!victory || director.battle.status !== 'victory') {
      this.celebrated = false
      return
    }
    const color = victory.result === 'blue' ? teamPalette.blue : victory.result === 'red' ? teamPalette.red : teamPalette.gold
    if (!this.celebrated) {
      this.celebrated = true
      this.combat.spawn('confetti', width * 0.5, height * 0.3, 54, { color })
      this.combat.spawn('spark', width * 0.5, height * 0.42, 28, { color })
      this.combat.spawn('spark', width * 0.5, height * 0.36, 22, { color: 0xf4f7fb })
      this.combat.spawn('gold', width * 0.5, height * 0.34, 18)
      this.punch(color, 0.16)
    }
  }

  private release(floater: Floater): void {
    floater.node.removeFromParent()
    floater.node.visible = false
    if (this.textPool.length < 40) this.textPool.push(floater.node)
    else floater.node.destroy()
  }
}

function expose(channel: number): number {
  const n = Math.min(1, Math.max(0, channel / 255))
  const mid = Math.pow(n, 0.78)
  const lifted = mid * 1.08 + 0.045 * Math.sin(Math.min(1, mid) * Math.PI)
  return Math.min(255, lifted * 255)
}

function strokePathSafe(g: Graphics, pts: number[], width: number, color: number, alpha: number): void {
  if (pts.length < 4) return
  g.moveTo(pts[0]!, pts[1]!)
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!)
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' })
}
