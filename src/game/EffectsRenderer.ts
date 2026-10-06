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
  peak: number
}

const damageInk = { color: 0x14060c, width: 5, join: 'round' as const }
const damageStyles = {
  small: new TextStyle({ fontFamily: 'Oswald, Outfit, sans-serif', fontSize: 28, fill: 0xf4f7fb, fontWeight: '600', stroke: damageInk }),
  mid: new TextStyle({ fontFamily: 'Oswald, Outfit, sans-serif', fontSize: 42, fill: 0xffe8ec, fontWeight: '600', stroke: damageInk }),
  large: new TextStyle({ fontFamily: 'Oswald, Outfit, sans-serif', fontSize: 64, fill: 0xfff6ea, fontWeight: '700', stroke: damageInk }),
  huge: new TextStyle({ fontFamily: 'Oswald, Outfit, sans-serif', fontSize: 92, fill: 0xffffff, fontWeight: '700', stroke: damageInk }),
}

/** Point chips sit on the avatars: same Oswald numbers as the score, team color as the stroke. */
const hitStyles = {
  red: new TextStyle({
    fontFamily: 'Oswald, Outfit, sans-serif',
    fontSize: 40,
    fill: 0xfff8f2,
    fontWeight: '700',
    letterSpacing: 0.4,
    stroke: { color: 0x9b1230, width: 4, join: 'round' },
    dropShadow: { alpha: 0.55, angle: Math.PI / 2, blur: 2, color: 0x07080d, distance: 2 },
  }),
  blue: new TextStyle({
    fontFamily: 'Oswald, Outfit, sans-serif',
    fontSize: 40,
    fill: 0xfff8f2,
    fontWeight: '700',
    letterSpacing: 0.4,
    stroke: { color: 0x143a9a, width: 4, join: 'round' },
    dropShadow: { alpha: 0.55, angle: Math.PI / 2, blur: 2, color: 0x07080d, distance: 2 },
  }),
}

const tagStyles = {
  red: new TextStyle({ fontFamily: 'Outfit, sans-serif', fontSize: 22, fill: 0xffffff, fontWeight: '800', stroke: { color: 0x9b1230, width: 5, join: 'round' } }),
  blue: new TextStyle({ fontFamily: 'Outfit, sans-serif', fontSize: 22, fill: 0xffffff, fontWeight: '800', stroke: { color: 0x143a9a, width: 5, join: 'round' } }),
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
  sky.addColorStop(0, 'rgba(180, 40, 64, 0.42)')
  sky.addColorStop(0.2, 'rgba(160, 32, 56, 0.22)')
  sky.addColorStop(0.46, 'rgba(8, 13, 24, 0.12)')
  sky.addColorStop(0.54, 'rgba(8, 13, 24, 0.12)')
  sky.addColorStop(0.8, 'rgba(20, 70, 160, 0.24)')
  sky.addColorStop(1, 'rgba(14, 63, 145, 0.4)')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 512, 640)
  const aurora = ctx.createLinearGradient(0, 40, 180, 520)
  aurora.addColorStop(0, 'rgba(255,255,255,0.16)')
  aurora.addColorStop(0.4, 'rgba(185, 31, 58, 0.1)')
  aurora.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = aurora
  ctx.fillRect(0, 0, 250, 600)
  const stars = ctx.createLinearGradient(320, 30, 512, 540)
  stars.addColorStop(0, 'rgba(255,255,255,0.12)')
  stars.addColorStop(0.45, 'rgba(37, 131, 255, 0.1)')
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
  gradient.addColorStop(0.62, 'rgba(0,0,0,0.08)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.38)')
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
  private honored = false
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
    this.redGlow = new Sprite(glowTexture('rgba(180, 24, 58, 0.28)', 'rgba(120, 16, 40, 0.1)'))
    this.blueGlow = new Sprite(glowTexture('rgba(30, 90, 200, 0.26)', 'rgba(40, 120, 200, 0.1)'))
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
      const widthPx = canvas.width
      const heightPx = Math.max(1, canvas.height)
      for (let i = 0; i < data.length; i += 4) {
        const y = Math.floor(i / 4 / widthPx) / heightPx
        const band = playerBand(y)
        const lifted = [expose(data[i]!), expose(data[i + 1]!), expose(data[i + 2]!)]
        const gray = lifted[0]! * 0.3 + lifted[1]! * 0.59 + lifted[2]! * 0.11
        const sat = 1.0 + (0.8 - 1.0) * band
        const dim = 0.96 + (0.76 - 0.96) * band
        const contrast = 1 + (0.93 - 1) * band
        data[i] = gradeChannel(gray, lifted[0]!, sat, dim, contrast)
        data[i + 1] = gradeChannel(gray, lifted[1]!, sat, dim, contrast)
        data[i + 2] = gradeChannel(gray, lifted[2]!, sat, dim, contrast)
      }
      ctx.putImageData(frame, 0, 0)
      const graded = Texture.from(canvas)
      graded.source.scaleMode = 'linear'
      graded.source.autoGenerateMipmaps = true
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
    this.world.addChild(this.attackGfx)
    this.world.addChild(this.glowGfx)
    this.playClip.renderable = true
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

  spawnDamage(x: number, y: number, amount: number, force = false, loud = false, team?: 'red' | 'blue'): void {
    if (amount <= 0) return
    if (!loud && amount < 20 && this.floaters.length >= (force ? 18 : 6)) return
    const node = this.textPool.pop() ?? new Text({ text: '', style: damageStyles.small })
    node.anchor.set(0.5)
    node.resolution = Math.max(2, renderResolution())
    node.text = formatDamage(amount)
    node.style = loud ? hitStyles[team ?? 'red'] : amount >= 15_000 ? damageStyles.huge : amount >= 1_500 ? damageStyles.large : amount >= 250 ? damageStyles.mid : damageStyles.small
    node.visible = true
    const placed = Math.min(y, stageY(GAMEPLAY_END - 28, this.viewHeight))
    node.position.set(x, placed)
    this.damageLayer.addChild(node)
    this.floaters.push({
      node,
      age: 0,
      life: loud ? 1.25 : amount >= 8_000 ? 1.15 : amount >= 400 ? 0.95 : 0.78,
      vy: loud ? -22 : amount >= 8_000 ? -78 : amount >= 400 ? -58 : -42,
      x,
      y: placed,
      peak: loud ? 1.06 : 1.3,
    })
  }

  /** Small short-lived caption, e.g. a team switch, drawn over the battlefield. */
  spawnTag(x: number, y: number, text: string, team: 'red' | 'blue'): void {
    const node = this.textPool.pop() ?? new Text({ text: '', style: tagStyles[team] })
    node.anchor.set(0.5)
    node.resolution = Math.max(2, renderResolution())
    node.text = text
    node.style = tagStyles[team]
    node.visible = true
    const placed = Math.max(stageY(TOP_SAFE_ZONE + 24, this.viewHeight), Math.min(y, stageY(GAMEPLAY_END - 28, this.viewHeight)))
    node.position.set(x, placed)
    this.damageLayer.addChild(node)
    this.floaters.push({ node, age: 0, life: 1.6, vy: -26, x, y: placed, peak: 1.3 })
  }

  reset(): void {
    this.combat.clear()
    this.flash = 0
    this.trauma = 0
    this.celebrated = false
    this.honored = false
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
    this.redGlow.alpha = 0.02 + director.battle.red.momentum * 0.02 + director.teamFlash.red * 0.1 + boost + redRush
    this.blueGlow.alpha = 0.02 + director.battle.blue.momentum * 0.02 + director.teamFlash.blue * 0.1 + boost + blueRush
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
    this.backdrop.alpha = 1
    this.backdrop.filters = null
    if (this.atmosphere.texture !== softSky) {
      this.atmosphere.texture = softSky
    }
    this.atmosphere.position.set(width / 2, height / 2)
    this.atmosphere.width = width
    this.atmosphere.height = height
    this.atmosphere.alpha = 0.04
  }

  private drawBase(width: number, height: number): void {
    this.base.clear()
    const floor = height * battleConfig.floorTop
    washSide(this.base, 0, width * 0.5, height, 0x4a1220, 0x8a1e36)
    washSide(this.base, width * 0.5, width * 0.5, height, 0x0c2048, 0x123f86)
    this.base.rect(0, 0, width, height).fill({ color: 0x060910, alpha: 0.08 })
    drawDivider(this.base, width, floor, this.time)
    this.base.ellipse(width * 0.28, height * 0.42, width * 0.22, height * 0.08).fill({ color: teamPalette.red, alpha: 0.02 })
    this.base.ellipse(width * 0.72, height * 0.42, width * 0.22, height * 0.08).fill({ color: teamPalette.blue, alpha: 0.02 })
    this.base.rect(0, floor, width, height - floor).fill({ color: 0x070910, alpha: 0.16 })
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
    this.riftGfx.rect(0, 0, width, height).fill({ color: 0x080d18, alpha: 0.02 })
    const shadeTop = stageY(600, height)
    const shadeSpan = stageY(1240, height) - shadeTop
    const shadeBands = 8
    for (let i = 0; i < shadeBands; i += 1) {
      const t = (i + 0.5) / shadeBands
      const fade = Math.sin(t * Math.PI)
      this.riftGfx.rect(0, shadeTop + shadeSpan * (i / shadeBands), width, shadeSpan / shadeBands + 1).fill({
        color: 0x05070e,
        alpha: 0.14 * fade,
      })
    }
    const band = height * 0.1
    for (let i = 0; i < 6; i += 1) {
      const fade = 1 - i / 6
      this.riftGfx.rect(0, (band * i) / 6, width, band / 6 + 1).fill({ color: 0x05070c, alpha: 0.4 * fade })
    }
    const redFlash = director.teamFlash.red
    const blueFlash = director.teamFlash.blue
    const shove = (redFlash - blueFlash) * width * 0.07
    const surge = Math.max(redFlash, blueFlash)
    const vip = director.cinematic > 0.45 || surge > 0.72
    const floorTop = height * battleConfig.floorTop
    const floorH = height - floorTop
    this.riftGfx.ellipse(width * 0.32, floorTop + floorH * 0.42, width * 0.1, height * 0.008).fill({ color: 0xffffff, alpha: 0.01 })
    const x = this.rift * width + shove
    const top = stageY(TOP_SAFE_ZONE, height)
    const span = Math.max(40, floorTop - top - height * 0.03)
    const ripple = vip ? 3.2 + surge * 4 : surge > 0.45 ? 1.8 + surge * 2 : 0.35
    const pts: number[] = []
    const steps = 16
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps
      const y = top + t * span
      const wave = Math.sin(t * 11 + this.time * (surge > 0.45 ? 6.5 : 1.1)) * ripple
      pts.push(x + wave, y)
    }
    const left = pts.map((value, index) => (index % 2 === 0 ? value - 2.2 : value))
    const right = pts.map((value, index) => (index % 2 === 0 ? value + 2.2 : value))
    strokePathSafe(this.riftGfx, left, 6, 0xff3d86, 0.82)
    strokePathSafe(this.riftGfx, right, 6, 0x3ec8ff, 0.82)
    strokePathSafe(this.riftGfx, pts, 2.2, 0xffffff, 0.95)
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
      const peak = floater.peak
      const pop = t < 0.16 ? 0.45 + (t / 0.16) * (peak - 0.45) : peak - Math.min(peak - 1, (t - 0.16) * 0.4)
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
      this.honored = false
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
    if (!this.honored && director.battle.victoryElapsed >= 2_000) {
      this.honored = true
      this.combat.spawn('confetti', width * 0.5, height * 0.46, 36, { color })
      this.combat.spawn('gold', width * 0.5, height * 0.5, 16)
    }
  }

  private release(floater: Floater): void {
    floater.node.removeFromParent()
    floater.node.visible = false
    if (this.textPool.length < 40) this.textPool.push(floater.node)
    else floater.node.destroy()
  }
}

function washSide(g: Graphics, x: number, w: number, h: number, from: number, to: number): void {
  g.rect(x, 0, w, h).fill({ color: from })
  const bands = 7
  for (let i = 0; i < bands; i += 1) {
    const t = i / (bands - 1)
    g.rect(x, (h * i) / bands, w, h / bands + 1).fill({ color: to, alpha: t * 0.72 })
  }
}

function drawDivider(g: Graphics, width: number, floor: number, time: number): void {
  const x = width * 0.5
  const h = floor * 0.96
  const pulse = 0.82 + Math.sin(time * 2.1) * 0.14
  g.rect(x - 6, 0, 6, h).fill({ color: 0xff2d78, alpha: 0.16 * pulse })
  g.rect(x, 0, 6, h).fill({ color: 0x3ec6ff, alpha: 0.16 * pulse })
  g.rect(x - 1.4, 0, 1.4, h).fill({ color: 0xff4d9a, alpha: 0.72 })
  g.rect(x, 0, 1.4, h).fill({ color: 0x4ad4ff, alpha: 0.72 })
  g.rect(x - 0.35, 0, 0.7, h).fill({ color: 0xffffff, alpha: 0.45 * pulse })
}

function playerBand(y: number): number {
  const start = smoothstep(600 / DESIGN_HEIGHT, 660 / DESIGN_HEIGHT, y)
  const end = 1 - smoothstep(1180 / DESIGN_HEIGHT, 1240 / DESIGN_HEIGHT, y)
  return Math.max(0, Math.min(1, start * end))
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function gradeChannel(gray: number, channel: number, sat: number, dim: number, contrast: number): number {
  const colored = gray + (channel - gray) * sat
  const contrasted = (colored - 128) * contrast + 128
  return Math.min(255, Math.max(0, contrasted * dim))
}

function expose(channel: number): number {
  const n = Math.min(1, Math.max(0, channel / 255))
  const mid = Math.pow(n, 0.92)
  const lifted = mid * 1.02 + 0.02 * Math.sin(Math.min(1, mid) * Math.PI)
  return Math.min(255, lifted * 255)
}

function strokePathSafe(g: Graphics, pts: number[], width: number, color: number, alpha: number): void {
  if (pts.length < 4) return
  g.moveTo(pts[0]!, pts[1]!)
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!)
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' })
}
