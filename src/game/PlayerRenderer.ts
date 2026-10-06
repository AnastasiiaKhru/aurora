import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import { battleConfig } from '../config/battleConfig.ts'
import { teamPalette } from '../config/effectConfig.ts'
import { director } from '../systems/GameDirector.ts'
import type { TeamId } from '../types/Team.ts'
import { clamp, easeOutCubic } from '../utils/math.ts'
import { DESIGN_HEIGHT, DESIGN_WIDTH, GAMEPLAY_END, clampedAttackScale, permanentAvatarDiameter } from '../broadcast/stage.ts'
import { motionDebug, teamBox } from '../systems/playerMotion.ts'
import { readReaction } from './vfxReactions.ts'

const badgeStyle = new TextStyle({
  fontFamily: 'Outfit, sans-serif',
  fontSize: 11,
  fill: 0xfff6ea,
  fontWeight: '800',
  letterSpacing: 0.6,
})

const nameStyle = new TextStyle({
  fontFamily: 'Outfit, sans-serif',
  fontSize: 15,
  fill: 0xfff8f2,
  fontWeight: '700',
  letterSpacing: 0.4,
  stroke: { color: 0x14060a, width: 1.5 },
})

interface PlayerView {
  root: Container
  aura: Graphics
  charge: Graphics
  frame: Graphics
  life: Graphics
  label: Container
  plate: Graphics
  avatar: Sprite
  mask: Graphics
  name: Text
  badge: Text
  radius: number
  team: TeamId
  textureKey: string
  signature: string
}

export class PlayerRenderer {
  private readonly views = new Map<string, PlayerView>()
  private readonly textures = new Map<string, Texture>()
  private readonly loading = new Set<string>()
  private readonly layer: Container
  private readonly guide = new Graphics()

  constructor(layer: Container) {
    this.layer = layer
    this.guide.eventMode = 'none'
    layer.addChild(this.guide)
  }

  sync(width: number, height: number, time: number): void {
    const seen = new Set<string>()
    for (const body of director.players.bodies.values()) {
      const player = director.players.players.get(body.id)
      if (!player || body.shown === 0) continue
      seen.add(body.id)
      let view = this.views.get(body.id)
      if (!view) {
        view = this.create(player.username, body.team)
        this.views.set(body.id, view)
        this.layer.addChild(view.root)
      }
      const count = Math.max(1, director.players.shownCount(body.team))
      const cols = count <= 4 ? 2 : count <= 9 ? 3 : count <= 16 ? 4 : 5
      const rows = Math.ceil(count / cols)
      const cell = Math.min((width * 0.34) / cols, (height * 0.28) / rows)
      const boss = director.hud.leaderboard.find((entry) => entry.battlePoints > 0)
      const crowned = boss?.id === body.id
      const selected = director.hud.selected?.id === body.id
      const diameter = Math.min(permanentAvatarDiameter(body.power || 0, crowned), cell * 0.92)
      const radius = diameter / 2
      const signature = `${body.team}:${Math.round(radius)}:${selected ? 1 : 0}:${crowned ? 1 : 0}`
      if (view.signature !== signature) {
        view.team = body.team
        view.radius = radius
        view.signature = signature
        this.paint(view, radius, body.team, selected, crowned)
      }
      if (view.textureKey !== player.avatarKey) {
        view.textureKey = player.avatarKey
        view.avatar.texture = this.textureFor(player.avatarKey, player.avatarUrl)
        this.fit(view)
      }
      const joining = body.spawn < 1
      const presence = joining ? joinScale(body.spawn) : 1
      const period = 1.8 + (body.phase % 1.4)
      const color = body.team === 'red' ? teamPalette.red : teamPalette.blue
      view.charge.clear()
      if (joining) {
        view.charge.circle(0, 0, view.radius * (0.35 + body.spawn * 1.45)).stroke({
          width: 1.6,
          color,
          alpha: (1 - body.spawn) * 0.9,
        })
      }
      const energy = Math.max(body.surge || 0, body.grow || 0)
      if ((body.poseMode || 0) > 0) {
        const spin = body.poseSpin || 0
        const ring = body.team === 'red' ? 0xfff3ea : 0xe7f0ff
        view.charge.arc(0, 0, view.radius * 1.14, spin, spin + 1.35).stroke({ width: 2.2, color: ring, alpha: 0.95 })
        view.charge.arc(0, 0, view.radius * 1.14, spin + 2.2, spin + 2.7).stroke({ width: 1.3, color, alpha: 0.8 })
      }
      if ((body.crown || 0) > 0) {
        const crownY = -view.radius * 1.45
        view.charge.poly([
          -view.radius * 0.55, crownY + view.radius * 0.28,
          -view.radius * 0.38, crownY,
          0, crownY + view.radius * 0.16,
          view.radius * 0.38, crownY,
          view.radius * 0.55, crownY + view.radius * 0.28,
        ]).fill({ color: 0xf0c56a, alpha: 0.95 })
      }
      if ((body.crack || 0) > 0.05) {
        const cracks = body.crack
        for (let i = 0; i < 4; i += 1) {
          const angle = body.phase + i * 1.4
          view.charge.moveTo(Math.cos(angle) * view.radius * 0.2, Math.sin(angle) * view.radius * 0.2)
          view.charge.lineTo(Math.cos(angle) * view.radius * (0.7 + cracks * 0.4), Math.sin(angle) * view.radius * (0.7 + cracks * 0.4))
        }
        view.charge.stroke({ width: 1.3, color: 0xfff8f2, alpha: Math.min(0.9, cracks) })
      }
      if ((body.frost || 0) > 0.05) {
        view.charge.circle(0, 0, view.radius * 1.18).stroke({ width: 1.4, color: 0xd7ecff, alpha: body.frost * 0.8 })
      }
      if (body.motion === 'stunned') {
        const spin = time * 2.4 + body.phase
        view.charge.arc(0, 0, view.radius * 1.32, spin, spin + 1.1).stroke({ width: 2.4, color: 0xfff6ea, alpha: 0.85 })
        view.charge.arc(0, 0, view.radius * 1.32, spin + Math.PI, spin + Math.PI + 0.7).stroke({ width: 1.6, color, alpha: 0.7 })
      }
      if ((body.trail || 0) > 0.18 && body.motion !== 'defeated') {
        const speed = Math.hypot(body.vx || 0, body.vy || 0) || 1
        const len = view.radius * (0.35 + body.trail)
        view.charge.moveTo(0, 0)
        view.charge.lineTo((-(body.vx || 0) / speed) * len, (-(body.vy || 0) / speed) * len)
        view.charge.stroke({ width: 3, color, alpha: 0.28 * body.trail, cap: 'round' })
      }
      let deathScale = 1
      let deathSquash = 1
      let deathAlpha = 1
      if (body.dying > 0) {
        const age = 1 - Math.max(0, Math.min(1, body.dying / battleConfig.playerDeathSeconds))
        if (age < 0.42) {
          for (let i = 0; i < 6; i += 1) {
            const angle = body.phase + i * 1.15
            const len = view.radius * (0.3 + age * 1.5)
            view.charge.moveTo(Math.cos(angle) * view.radius * 0.12, Math.sin(angle) * view.radius * 0.12)
            view.charge.lineTo(Math.cos(angle) * len, Math.sin(angle) * len)
          }
          view.charge.stroke({ width: 1.7, color: 0xfff8f2, alpha: 0.95 })
          deathScale = 1 - age * 0.18
          deathSquash = 1 - age * 0.55
        } else {
          const burst = (age - 0.42) / 0.58
          view.charge.circle(0, 0, view.radius * (0.9 + burst * 1.7)).fill({ color, alpha: (1 - burst) * 0.5 })
          view.charge.circle(0, 0, view.radius * (1.1 + burst * 1.45)).stroke({ width: 2, color: 0xffffff, alpha: 1 - burst })
          for (let i = 0; i < 8; i += 1) {
            const angle = body.phase + i * 0.8
            const dist = view.radius * (1 + burst * 2.1)
            view.charge.circle(Math.cos(angle) * dist, Math.sin(angle) * dist, Math.max(0.7, view.radius * 0.14 * (1 - burst))).fill({ color: 0xfff6ea, alpha: 1 - burst })
          }
          deathScale = 1.05 + Math.sin(burst * Math.PI) * 0.48
          deathAlpha = burst < 0.45 ? 1 : Math.max(0, 1 - (burst - 0.45) / 0.55)
        }
      } else if (body.attack > 0.82) {
        view.charge.circle(0, 0, view.radius * 1.12).stroke({ width: 1, color: 0xffffff, alpha: (body.attack - 0.82) / 0.18 })
      }
      if (energy > 0.22) {
        const spin = time * 1.4 + body.phase
        view.charge.circle(0, 0, view.radius * (1.22 + Math.sin(spin) * 0.03)).stroke({ width: 0.8, color, alpha: Math.min(0.55, energy) })
      }
      const life = body.maxHp <= 0 ? 1 : Math.max(0, Math.min(1, body.hp / body.maxHp))
      this.paintLife(view, life, body.flinch + body.hurt)
      const surge = body.surge || 0
      const breathe = joining ? 1 : idleScale(time, body.phase, period)
      const temporary = clampedAttackScale(body.poseScale || 1, body.power || 0, body.posePeak || 1)
      const squash = body.poseSquash || 1
      const scale = clamp(presence * breathe * temporary * deathScale, 0.35, 1.4)
      const react = readReaction(body.id)
      if (react.glow > 0.05) {
        view.charge.circle(0, 0, view.radius * 1.1).stroke({
          width: 1.1,
          color: react.color,
          alpha: Math.min(0.7, react.glow),
        })
      }
      const ox = clamp(react.x + react.leanX, -16, 16)
      const oy = clamp(react.y + react.leanY, -16, 16)
      const recoil = (body.poseRecoil || 0) * 12 * (body.team === 'red' ? -1 : 1)
      const lift = (body.lift || 0) * 18
      const pixelY = body.y * height - surge * 10 + oy - lift
      const lane = teamBox(body.team, false, Math.max(12, body.motionR || view.radius))
      const sx = width / DESIGN_WIDTH
      const sy = height / DESIGN_HEIGHT
      const placedX = clamp(body.x * width + ox + recoil, lane.x0 * sx, lane.x1 * sx)
      const placedY = clamp(pixelY, lane.y0 * sy, lane.y1 * sy)
      const stretch = 1 + Math.min(0.07, (body.trail || 0) * 0.07)
      view.root.position.set(placedX, placedY)
      view.root.scale.set(scale * squash * stretch, (scale * deathSquash * (2 - squash)) / stretch)
      const lean = joining ? 0 : body.lean || 0
      view.root.rotation = joining ? 0 : lean + (body.spin || 0) + Math.sin((time + body.phase) * ((Math.PI * 2) / period)) * ((0.4 + (body.phase % 0.55)) * Math.PI) / 180
      view.root.alpha = (joining ? easeOutCubic(body.spawn) : 1) * deathAlpha
      view.root.zIndex = Math.round(body.y * 1000 + surge * 500)
      view.aura.alpha = 0.85
      view.aura.scale.set(1)
      const showName = body.nameTime > 0 || selected || crowned
      view.name.text = player.username
      view.name.visible = showName
      view.badge.visible = false
      view.label.visible = showName
      const labelScale = 1 / Math.max(0.45, view.root.scale.x)
      view.label.scale.set(labelScale)
      view.label.x = 0
      const nameDrop = view.label.y * Math.abs(view.root.scale.y)
      if (placedY + nameDrop > GAMEPLAY_END - 12) {
        view.label.y = (GAMEPLAY_END - 12 - placedY) / Math.max(0.45, Math.abs(view.root.scale.y))
      }
      this.paintPlate(view, body.team, showName)
    }
    this.paintGuide(width, height)
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue
      view.root.destroy({ children: true })
      this.views.delete(id)
    }
  }

  private paintGuide(width: number, height: number): void {
    this.guide.clear()
    this.guide.zIndex = 5000
    if (!motionDebug.bounds && !motionDebug.collisions) return
    const sx = width / DESIGN_WIDTH
    const sy = height / DESIGN_HEIGHT
    if (motionDebug.bounds) {
      const lanes = [teamBox('red', false), teamBox('blue', false)]
      for (const lane of lanes) {
        this.guide.rect(lane.x0 * sx, lane.y0 * sy, (lane.x1 - lane.x0) * sx, (lane.y1 - lane.y0) * sy)
          .stroke({ width: 2, color: 0x7dffb3, alpha: 0.85 })
      }
    }
    if (motionDebug.collisions) {
      for (const body of director.players.bodies.values()) {
        if (body.shown === 0) continue
        this.guide.circle(body.x * width, body.y * height, body.motionR || 40).stroke({ width: 1.5, color: 0xffe08a, alpha: 0.8 })
      }
    }
  }

  reset(): void {
    for (const view of this.views.values()) view.root.destroy({ children: true })
    this.views.clear()
    for (const texture of this.textures.values()) texture.destroy(true)
    this.textures.clear()
  }

  private create(username: string, team: TeamId): PlayerView {
    const root = new Container()
    const aura = new Graphics()
    const charge = new Graphics()
    const frame = new Graphics()
    const life = new Graphics()
    const label = new Container()
    const plate = new Graphics()
    const avatar = new Sprite(Texture.EMPTY)
    const mask = new Graphics()
    const name = new Text({ text: username, style: nameStyle.clone() })
    const badge = new Text({ text: 'NPC', style: badgeStyle.clone() })
    avatar.anchor.set(0.5)
    name.anchor.set(0.5, 0.5)
    badge.anchor.set(0, 0.5)
    name.resolution = 3
    badge.resolution = 3
    badge.visible = false
    label.addChild(plate, name, badge)
    root.addChild(aura, frame, avatar, mask, life, charge, label)
    avatar.mask = mask
    const view: PlayerView = {
      root, aura, charge, frame, life, label, plate, avatar, mask, name, badge, radius: -1, team, textureKey: '', signature: '',
    }
    return view
  }

  private paint(view: PlayerView, radius: number, team: TeamId, selected = false, crowned = false): void {
    const color = team === 'red' ? teamPalette.red : teamPalette.blue
    view.aura.clear()
    view.aura.circle(0, 0, radius * 1.34).fill({ color, alpha: 0.16 })
    view.aura.circle(0, 0, radius * 1.16).stroke({ width: 5, color, alpha: 0.28 })
    view.frame.clear()
    view.frame.circle(0, 0, radius * 1.05).stroke({ width: 3.1, color, alpha: 1 })
    view.frame.circle(0, 0, radius * 1.05).stroke({ width: 1.1, color: 0xfff8f2, alpha: 0.85 })
    if (crowned) {
      view.frame.circle(0, 0, radius * 1.2).stroke({ width: 1.5, color: 0xe6c98a, alpha: 0.95 })
      const crownY = -radius * 1.42
      view.frame.poly([
        -radius * 0.62, crownY + radius * 0.34,
        -radius * 0.62, crownY + radius * 0.08,
        -radius * 0.32, crownY + radius * 0.22,
        0, crownY,
        radius * 0.32, crownY + radius * 0.22,
        radius * 0.62, crownY + radius * 0.08,
        radius * 0.62, crownY + radius * 0.34,
      ]).fill({ color: 0xe6c98a })
    }
    if (selected) {
      view.frame.circle(0, 0, radius * 1.32).stroke({ width: 1.4, color: 0xfff6ea, alpha: 0.8 })
    }
    view.mask.clear()
    view.mask.circle(0, 0, radius * 0.9).fill(0xffffff)
    this.fit(view)
    view.label.y = radius * 1.78
    view.name.style.fontSize = Math.max(16, Math.round(radius * 0.82))
  }

  private paintPlate(view: PlayerView, team: TeamId, visible: boolean): void {
    view.plate.clear()
    if (!visible || view.radius <= 0 || !view.name.text) return
    const fontSize = Number(view.name.style.fontSize) || 16
    const letters = String(view.name.text).length
    const nameWidth = Math.max(view.name.width, letters * fontSize * 0.58)
    const badgeGap = view.badge.visible ? view.badge.width + 8 : 0
    const textWidth = nameWidth + badgeGap
    const textHeight = Math.max(view.name.height, fontSize * 1.15)
    const padX = Math.max(10, view.radius * 0.42)
    const padY = Math.max(5, view.radius * 0.16)
    view.name.x = view.badge.visible ? -badgeGap / 2 : 0
    view.badge.x = view.name.x + nameWidth / 2 + 6
    view.badge.y = 0
    const width = textWidth + padX * 2
    const height = textHeight + padY
    const color = team === 'red' ? teamPalette.red : teamPalette.blue
    view.plate.roundRect(-width / 2, -height / 2, width, height, height / 2).fill({ color: 0x12080c, alpha: 0.9 })
    view.plate.roundRect(-width / 2, -height / 2, width, height, height / 2).stroke({
      width: Math.max(1.6, view.radius * 0.08),
      color,
      alpha: 1,
    })
  }

  private paintLife(view: PlayerView, ratio: number, flinch: number): void {
    if (view.radius <= 0) return
    if (!view.life) {
      view.life = new Graphics()
      view.root.addChild(view.life)
    }
    view.life.clear()
    const track = view.team === 'red' ? 0xffc1cc : 0xc5d8ff
    view.life.arc(0, 0, view.radius * 1.2, -Math.PI / 2, Math.PI * 1.5).stroke({ width: 2.4, color: track, alpha: 0.35 })
    const color = ratio < 0.28 ? 0xffd36a : view.team === 'red' ? teamPalette.red : teamPalette.blue
    const end = -Math.PI / 2 + Math.PI * 2 * Math.max(0.04, ratio)
    view.life.arc(0, 0, view.radius * 1.2, -Math.PI / 2, end).stroke({
      width: 2.8 + flinch * 0.4,
      color,
      alpha: 0.95,
      cap: 'round',
    })
  }

  private fit(view: PlayerView): void {
    if (view.radius <= 0) return
    view.avatar.width = view.radius * 1.8
    view.avatar.height = view.radius * 1.8
  }

  private textureFor(key: string, url: string): Texture {
    const cached = this.textures.get(key)
    if (cached) return cached
    if (url.startsWith('npc:') || !url || this.loading.has(key)) return Texture.EMPTY
    this.loading.add(key)
    const src = key.startsWith('remote:') ? `/proxy-image?url=${encodeURIComponent(url)}` : url
    this.loadImage(key, src, !key.startsWith('local:'))
    return Texture.EMPTY
  }

  private loadImage(key: string, src: string, canFallback: boolean): void {
    const image = new Image()
    image.onload = () => {
      const texture = Texture.from(image)
      texture.source.scaleMode = 'linear'
      texture.source.autoGenerateMipmaps = false
      this.textures.set(key, texture)
      this.applyTexture(key, texture)
    }
    image.onerror = () => {
      if (!canFallback) {
        this.loading.delete(key)
        return
      }
      let hash = 0
      for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0
      const slot = String((hash % 60) + 1).padStart(2, '0')
      this.loadImage(key, `/avatars/${slot}.jpg`, false)
    }
    image.src = src
  }

  private applyTexture(key: string, texture: Texture): void {
    for (const view of this.views.values()) {
      if (view.textureKey !== key) continue
      view.avatar.texture = texture
      this.fit(view)
    }
  }
}

function joinScale(spawn: number): number {
  if (spawn < 0.55) return 0.6 + 0.52 * easeOutCubic(spawn / 0.55)
  return 1.12 - 0.12 * easeOutCubic((spawn - 0.55) / 0.45)
}

function idleScale(time: number, phase: number, period: number): number {
  const u = ((time + phase) % period) / period
  if (u < 0.34) return 1 + 0.025 * easeOutCubic(u / 0.34)
  if (u < 0.67) return 1.025 - 0.035 * ((u - 0.34) / 0.33)
  return 0.99 + 0.01 * ((u - 0.67) / 0.33)
}
