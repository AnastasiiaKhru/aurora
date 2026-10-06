import { Container, Sprite, Texture } from 'pixi.js'

function radialTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.EMPTY
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  glow.addColorStop(0, 'rgba(255,255,255,1)')
  glow.addColorStop(0.16, 'rgba(255,255,255,0.92)')
  glow.addColorStop(0.42, 'rgba(255,255,255,0.28)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 128, 128)
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'linear'
  return texture
}

function streakTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 48
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.EMPTY
  const along = ctx.createLinearGradient(0, 0, 160, 0)
  along.addColorStop(0, 'rgba(255,255,255,0)')
  along.addColorStop(0.28, 'rgba(255,255,255,0.25)')
  along.addColorStop(0.72, 'rgba(255,255,255,0.85)')
  along.addColorStop(1, 'rgba(255,255,255,1)')
  ctx.fillStyle = along
  ctx.fillRect(0, 0, 160, 48)
  ctx.globalCompositeOperation = 'destination-in'
  const across = ctx.createLinearGradient(0, 0, 0, 48)
  across.addColorStop(0, 'rgba(0,0,0,0)')
  across.addColorStop(0.5, 'rgba(0,0,0,1)')
  across.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = across
  ctx.fillRect(0, 0, 160, 48)
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'linear'
  return texture
}

export class GlowPool {
  readonly root = new Container()
  private readonly orbTex: Texture
  private readonly streakTex: Texture
  private readonly orbs: Sprite[] = []
  private readonly streaks: Sprite[] = []
  private orbUsed = 0
  private streakUsed = 0

  constructor() {
    this.root.blendMode = 'add'
    this.orbTex = radialTexture()
    this.streakTex = streakTexture()
  }

  begin(): void {
    this.orbUsed = 0
    this.streakUsed = 0
  }

  end(): void {
    for (let i = this.orbUsed; i < this.orbs.length; i += 1) this.orbs[i]!.visible = false
    for (let i = this.streakUsed; i < this.streaks.length; i += 1) this.streaks[i]!.visible = false
  }

  orb(x: number, y: number, diameter: number, color: number, alpha: number): void {
    if (alpha < 0.03 || diameter < 1 || this.orbUsed > 420) return
    const sprite = this.orbs[this.orbUsed] ?? this.make(this.orbs, this.orbTex)
    this.orbUsed += 1
    sprite.visible = true
    sprite.position.set(x, y)
    sprite.rotation = 0
    sprite.scale.set(diameter / 128)
    sprite.tint = color
    sprite.alpha = Math.min(1, alpha)
  }

  streak(x: number, y: number, length: number, thickness: number, rotation: number, color: number, alpha: number): void {
    if (alpha < 0.03 || length < 2 || this.streakUsed > 420) return
    const sprite = this.streaks[this.streakUsed] ?? this.make(this.streaks, this.streakTex)
    this.streakUsed += 1
    sprite.visible = true
    sprite.position.set(x, y)
    sprite.rotation = rotation
    sprite.scale.set(length / 160, Math.max(0.12, thickness / 48))
    sprite.tint = color
    sprite.alpha = Math.min(1, alpha)
  }

  private make(list: Sprite[], texture: Texture): Sprite {
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    sprite.blendMode = 'add'
    this.root.addChild(sprite)
    list.push(sprite)
    return sprite
  }
}
