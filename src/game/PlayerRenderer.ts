import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import { battleConfig } from '../config/battleConfig.ts'
import { teamPalette } from '../config/effectConfig.ts'
import { director } from '../systems/GameDirector.ts'
import type { TeamId } from '../types/Team.ts'
import { clamp, easeOutCubic } from '../utils/math.ts'
import { DESIGN_HEIGHT, DESIGN_WIDTH, FOREGROUND_SCALE, clampedAttackScale, permanentAvatarDiameter } from '../broadcast/stage.ts'
import { motionDebug, teamBox } from '../systems/playerMotion.ts'
import { readReaction, tickReactionsClock } from './vfxReactions.ts'

const badgeStyle = new TextStyle({
  fontFamily: 'Outfit, sans-serif',
  fontSize: 11,
  fill: 0xfff6ea,
  fontWeight: '800',
  letterSpacing: 0.6,
})

function paintRankCrown(g: Graphics, radius: number, rank: 1 | 2 | 3): void {
  const metal = rank === 1 ? 0xffe29a : rank === 2 ? 0xf4f7fb : 0xf2b27a
  const deep = rank === 1 ? 0x8d5a12 : rank === 2 ? 0x66707c : 0x7a4218
  const shine = 0xfffdf8
  const jewel = rank === 1 ? 0xff2d4a : rank === 2 ? 0x4eb6ff : 0xffd56a
  const scale = rank === 1 ? 1 : rank === 2 ? 0.92 : 0.84
  const band = radius * 1.05 * scale
  const base = -radius * 1.02
  const thickness = Math.max(4, radius * 0.13 * scale)
  const peaks = rank === 1
    ? [
        { x: -0.84, h: 0.52 },
        { x: -0.42, h: 0.78 },
        { x: 0, h: 1 },
        { x: 0.42, h: 0.78 },
        { x: 0.84, h: 0.52 },
      ]
    : rank === 2
      ? [
          { x: -0.72, h: 0.64 },
          { x: -0.24, h: 0.92 },
          { x: 0.24, h: 0.92 },
          { x: 0.72, h: 0.64 },
        ]
      : [
          { x: -0.62, h: 0.72 },
          { x: 0, h: 1 },
          { x: 0.62, h: 0.72 },
        ]
  const lift = radius * (rank === 1 ? 0.62 : rank === 2 ? 0.54 : 0.48)
  g.ellipse(0, base - radius * 0.02, band * 0.62, radius * 0.28).fill({ color: metal, alpha: 0.28 })
  g.roundRect(-band / 2, base, band, thickness, thickness * 0.4).fill({ color: deep })
  g.roundRect(-band / 2 + 1.4, base + 1.1, band - 2.8, thickness * 0.46, 1.2).fill({ color: metal })
  for (const peak of peaks) {
    const x = peak.x * (band * 0.46)
    const tip = base - lift * peak.h
    const half = Math.max(3.6, radius * 0.1 * scale)
    g.poly([x - half, base + thickness * 0.2, x, tip, x + half, base + thickness * 0.2]).fill({ color: deep })
    g.poly([x - half * 0.62, base + 1, x, tip + radius * 0.045, x + half * 0.62, base + 1]).fill({ color: metal })
    g.circle(x, tip + 0.4, Math.max(2, radius * (peak.h > 0.9 ? 0.055 : 0.042))).fill({ color: shine })
  }
  const jewelY = base + thickness * 0.58
  g.circle(0, jewelY, radius * (rank === 1 ? 0.072 : 0.058)).fill({ color: jewel })
  g.circle(-radius * 0.016, jewelY - radius * 0.018, radius * 0.02).fill({ color: 0xffffff, alpha: 0.9 })
  if (rank === 1) {
    g.circle(-band * 0.28, jewelY, radius * 0.042).fill({ color: 0x3ec8ff })
    g.circle(band * 0.28, jewelY, radius * 0.042).fill({ color: 0xff5a7a })
  } else if (rank === 2) {
    g.circle(-band * 0.24, jewelY, radius * 0.034).fill({ color: 0xffffff, alpha: 0.9 })
    g.circle(band * 0.24, jewelY, radius * 0.034).fill({ color: 0xffffff, alpha: 0.9 })
  }
}

const nameStyle = new TextStyle({
  fontFamily: 'Outfit, sans-serif',
  fontSize: 15,
  fill: 0xfff8f2,
  fontWeight: '600',
  letterSpacing: 0.4,
  stroke: { color: 0x12060c, width: 3, join: 'round' },
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
  private readonly ghosts = new Graphics()

  constructor(layer: Container) {
    this.layer = layer
    this.ghosts.eventMode = 'none'
    this.ghosts.zIndex = 0
    this.guide.eventMode = 'none'
    layer.addChild(this.ghosts)
    layer.addChild(this.guide)
  }

  sync(width: number, height: number, time: number): void {
    tickReactionsClock(time)
    this.paintGhosts(width, height)
    const seen = new Set<string>()
    const places = new Map<string, 1 | 2 | 3>()
    let slot = 1
    for (const entry of director.hud.leaderboard) {
      if (slot > 3) break
      if (entry.battlePoints <= 0) continue
      places.set(entry.id, slot as 1 | 2 | 3)
      slot += 1
    }
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
      const rank = places.get(body.id) ?? 0
      const selected = director.hud.selected?.id === body.id
      const diameter = Math.min(permanentAvatarDiameter(body.power || 0, rank === 1), cell * 0.92 * FOREGROUND_SCALE)
      const radius = diameter / 2
      const signature = `${body.team}:${Math.round(radius)}:${selected ? 1 : 0}:${rank}`
      if (view.signature !== signature) {
        view.team = body.team
        view.radius = radius
        view.signature = signature
        this.paint(view, radius, body.team, rank)
      }
      if (view.textureKey !== player.avatarKey || !faceReady(view.avatar.texture)) {
        view.textureKey = player.avatarKey
        view.avatar.texture = this.textureFor(player.avatarKey, player.avatarUrl)
        view.avatar.alpha = 1
        this.fit(view)
      }
      const joining = body.spawn < 1
      const presence = joining ? joinScale(body.spawn) : 1
      const period = 1.8 + (body.phase % 1.4)
      const color = body.team === 'red' ? 0xff3b6b : 0x3ec8ff
      view.charge.clear()
      if (joining) {
        view.charge.circle(0, 0, view.radius * (0.35 + body.spawn * 1.45)).stroke({
          width: 1.6,
          color,
          alpha: (1 - body.spawn) * 0.9,
        })
      }
      const energy = Math.max(body.surge || 0, body.grow || 0)
      if ((body.ultPhase || 0) > 0) {
        const spin = time * ((body.ultPhase || 0) === 1 ? 2.4 : 6.2)
        const glow = Math.min(1, Math.max(0, ((body.ultMul || 1) - 1) / 0.28))
        view.charge.arc(0, 0, view.radius * 1.12, spin, spin + 1.4).stroke({ width: 1.4, color, alpha: 0.9 * glow })
      } else if ((body.poseMode || 0) > 0) {
        const spin = body.poseSpin || 0
        const ring = body.team === 'red' ? 0xfff3ea : 0xe7f0ff
        view.charge.arc(0, 0, view.radius * 1.14, spin, spin + 1.35).stroke({ width: 2.2, color: ring, alpha: 0.95 })
        view.charge.arc(0, 0, view.radius * 1.14, spin + 2.2, spin + 2.7).stroke({ width: 1.3, color, alpha: 0.8 })
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
        const kick = (body.attack - 0.82) / 0.18
        view.charge.circle(0, 0, view.radius * (1.08 + kick * 0.06)).stroke({ width: 1.6, color, alpha: 0.45 + kick * 0.5 })
      }
      if (energy > 0.22) {
        const spin = time * 1.4 + body.phase
        view.charge.circle(0, 0, view.radius * (1.22 + Math.sin(spin) * 0.03)).stroke({ width: 0.8, color, alpha: Math.min(0.55, energy) })
      }
      const giftMul = body.giftMul > 0 ? body.giftMul : 1
      if (giftMul > 1.04 && body.dying <= 0) {
        const k = Math.min(1, (giftMul - 1) / 1.1)
        const spin = time * (5 + k * 6) + body.phase
        view.charge.circle(0, 0, view.radius * 1.08).stroke({ width: 1.5, color, alpha: 0.55 + k * 0.4 })
        view.charge.arc(0, 0, view.radius * 1.2, spin, spin + 1.1).stroke({ width: 1.2, color: 0xffffff, alpha: 0.7 * k })
      }
      const life = body.maxHp <= 0 ? 1 : Math.max(0, Math.min(1, body.hp / body.maxHp))
      this.paintLife(view, life, body.flinch + body.hurt)
      const surge = body.surge || 0
      const powered = (body.ultPhase || 0) > 0
      const breathe = joining || powered ? 1 : idleScale(time, body.phase, period)
      const pose = clampedAttackScale(body.poseScale || 1, body.power || 0, body.posePeak || 1)
      const temporary = pose
      const attackMul = Math.max(body.ultMul > 0 ? body.ultMul : 1, giftMul)
      const squash = body.poseSquash || 1
      const quiet = giftMul < 1.05 && (body.posePeak || 1) < 1.15 && (body.ultMul || 1) < 1.05
      const jab = quiet && body.dying <= 0 && body.attack > 0.82 ? 1 + 0.08 * Math.min(1, (body.attack - 0.82) / 0.18) : 1
      const react = readReaction(body.id)
      const scale = clamp(presence * breathe * temporary * attackMul * deathScale * jab * react.scale, 0.35, 2.6)
      if (react.ring > 0.04) {
        const ringColor = react.ringWhite ? 0xffffff : color
        view.charge.circle(0, 0, view.radius * (1.06 + react.ring * 0.08)).stroke({
          width: react.ringWhite ? 2.2 : 1.6,
          color: ringColor,
          alpha: 0.7 + react.ring * 0.3,
        })
      }
      if (react.glow > 0.05) {
        view.charge.circle(0, 0, view.radius * 1.1).stroke({
          width: 1.1,
          color: react.color,
          alpha: Math.min(0.7, react.glow),
        })
      }
      if (rank === 1 || rank === 2 || rank === 3) paintRankCrown(view.charge, view.radius, rank)
      const wobble = react.shake > 0 ? Math.sin(time * 54) * 4.5 * react.shake : 0
      const ox = clamp(react.x + react.leanX + wobble, -16, 16)
      const oy = clamp(react.y + react.leanY, -16, 16)
      const recoil = (body.poseRecoil || 0) * 12 * (body.team === 'red' ? -1 : 1)
      const lift = (body.lift || 0) * 18
      const pixelY = body.y * height - surge * 10 + oy - lift
      const lane = teamBox(body.team, false, Math.max(12, body.motionR || view.radius))
      const sx = width / DESIGN_WIDTH
      const sy = height / DESIGN_HEIGHT
      const dashing = (body.ultPhase || 0) === 3 && body.ultMove === 1
      const jitter = (body.ultJitter || 0) * Math.sin(time * 46) * 3.5
      const grown = giftMul > 1.04 && !dashing ? view.radius * (scale - 1) : 0
      const minX = dashing ? 16 * sx : lane.x0 * sx + grown
      const maxX = dashing ? width - 16 * sx : lane.x1 * sx - grown
      const placedX = clamp(body.x * width + ox + recoil + jitter, minX, Math.max(minX, maxX))
      const placedY = clamp(pixelY, lane.y0 * sy + grown, Math.max(lane.y0 * sy + grown, lane.y1 * sy - grown))
      const stretch = 1 + Math.min(0.07, (body.trail || 0) * 0.07)
      view.root.position.set(Math.round(placedX), Math.round(placedY))
      view.root.scale.set(scale * squash * stretch, (scale * deathSquash * (2 - squash)) / stretch)
      const lean = joining ? 0 : body.lean || 0
      view.root.rotation = joining ? 0 : lean + (body.spin || 0) + Math.sin((time + body.phase) * ((Math.PI * 2) / period)) * ((0.4 + (body.phase % 0.55)) * Math.PI) / 180
      view.root.alpha = (joining ? easeOutCubic(body.spawn) : 1) * deathAlpha
      view.root.zIndex = Math.round(body.y * 1000 + surge * 500 + (giftMul - 1) * 4000)
      view.aura.alpha = 1
      view.aura.scale.set(1)
      view.name.visible = false
      view.badge.visible = false
      view.label.visible = false
      view.plate.clear()
    }
    this.paintGuide(width, height)
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue
      view.root.destroy({ children: true })
      this.views.delete(id)
    }
  }

  private paintGhosts(width: number, height: number): void {
    this.ghosts.clear()
    const sy = height / DESIGN_HEIGHT
    for (const body of director.players.bodies.values()) {
      const xs = body.echoX
      const ys = body.echoY
      if (!xs || !ys || xs.length === 0) continue
      const color = body.team === 'red' ? teamPalette.red : teamPalette.blue
      for (let i = 0; i < xs.length; i += 1) {
        const fade = ((i + 1) / xs.length) * 0.42
        const radius = (body.motionR || 40) * (0.62 + 0.28 * (i / xs.length)) * sy
        const x = (xs[i] ?? body.x) * width
        const y = (ys[i] ?? body.y) * height
        this.ghosts.circle(x, y, radius).stroke({ width: 2, color, alpha: fade * 0.65 })
      }
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
    avatar.alpha = 1
    avatar.roundPixels = false
    name.anchor.set(0.5, 0.5)
    badge.anchor.set(0, 0.5)
    name.resolution = 3
    badge.resolution = 3
    badge.visible = false
    label.addChild(plate, name, badge)
    root.addChild(aura, frame, avatar, mask, life, charge, label)
    avatar.mask = mask
    const view: PlayerView = {
      root, aura, charge, frame, life, label, plate, avatar, mask, name, badge,
      radius: -1, team, textureKey: '', signature: '',
    }
    return view
  }

  private paint(view: PlayerView, radius: number, team: TeamId, rank: 0 | 1 | 2 | 3 = 0): void {
    const color = team === 'red' ? 0xc8102e : 0x1d4ed8
    const glow = team === 'red' ? 0xff5a78 : 0x4ad2ff
    const face = radius * 0.9
    const ring = rank === 1 ? 0xf6d27a : rank === 2 ? 0xd7e2ee : rank === 3 ? 0xe2a56a : color
    view.aura.clear()
    view.aura.ellipse(0, 3, face * 0.92, face * 0.34).fill({ color: 0x000000, alpha: 0.55 })
    view.aura.circle(0, 0, face + radius * 0.16).stroke({ width: Math.max(4, radius * 0.12), color: glow, alpha: 0.22 })
    if (rank > 0) view.aura.circle(0, -radius * 0.92, radius * 0.42).fill({ color: ring, alpha: rank === 1 ? 0.22 : 0.14 })
    view.frame.clear()
    view.frame.circle(0, 0, face + 1.5).stroke({ width: 3.5, color: ring, alpha: 0.14 })
    view.frame.circle(0, 0, face + 1.5).stroke({ width: rank > 0 ? 2.6 : 2, color: ring, alpha: 1 })
    view.mask.clear()
    view.mask.circle(0, 0, radius * 0.9).fill(0xffffff)
    this.fit(view)
    view.label.y = radius * 1.78
    view.name.style.fontSize = Math.max(12, Math.round(radius * (rank === 1 ? 0.34 : 0.4)))
    view.name.style.fill = rank === 1 ? 0xf6d78a : rank === 2 ? 0xe7eef6 : rank === 3 ? 0xf0c49a : 0xfff8f2
  }

  private paintLife(view: PlayerView, ratio: number, flinch: number): void {
    if (view.radius <= 0) return
    if (!view.life) {
      view.life = new Graphics()
      view.root.addChild(view.life)
    }
    view.life.clear()
    if (ratio > 0.97 && flinch < 0.05) return
    const color = ratio < 0.28 ? 0xffd36a : view.team === 'red' ? teamPalette.red : teamPalette.blue
    const end = -Math.PI / 2 + Math.PI * 2 * Math.max(0.04, ratio)
    view.life.arc(0, 0, view.radius * 1.1, -Math.PI / 2, end).stroke({
      width: 1,
      color,
      alpha: 0.7,
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
    if (faceReady(cached)) return cached!
    if (cached) this.textures.delete(key)
    if (url.startsWith('npc:') || !url || this.loading.has(key)) return Texture.EMPTY
    this.loading.add(key)
    const remote = key.startsWith('remote:')
    const sharp = remote ? sharperAvatarUrl(url) : null
    const src = remote ? `/proxy-image?url=${encodeURIComponent(sharp ?? url)}` : url
    const retry = sharp ? `/proxy-image?url=${encodeURIComponent(url)}` : ''
    this.loadImage(key, src, !key.startsWith('local:'), retry)
    return Texture.EMPTY
  }

  private loadImage(key: string, src: string, canFallback: boolean, retry = ''): void {
    const image = new Image()
    image.onload = () => {
      this.loading.delete(key)
      const texture = this.coverTexture(image)
      texture.source.scaleMode = 'linear'
      texture.source.autoGenerateMipmaps = false
      this.textures.set(key, texture)
      this.applyTexture(key, texture)
    }
    image.onerror = () => {
      if (retry) {
        this.loadImage(key, retry, canFallback)
        return
      }
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

  private coverTexture(image: HTMLImageElement): Texture {
    const canvas = sharpCover(image, 512)
    const texture = Texture.from(canvas)
    texture.source.scaleMode = 'linear'
    texture.source.autoGenerateMipmaps = false
    return texture
  }

  private applyTexture(key: string, texture: Texture): void {
    for (const view of this.views.values()) {
      if (view.textureKey !== key) continue
      view.avatar.texture = texture
      view.avatar.alpha = 1
      this.fit(view)
    }
  }
}

function faceReady(texture: Texture | null | undefined): boolean {
  if (!texture || texture === Texture.EMPTY || texture.destroyed) return false
  const source = texture.source
  return !!source && !source.destroyed && source.width > 1 && source.height > 1
}

function sharpCover(image: HTMLImageElement, edge: number): HTMLCanvasElement {
  const sw = Math.max(1, image.naturalWidth)
  const sh = Math.max(1, image.naturalHeight)
  const side = Math.min(sw, sh)
  let current = document.createElement('canvas')
  current.width = side
  current.height = side
  const first = current.getContext('2d')
  if (!first) return current
  first.imageSmoothingEnabled = true
  first.imageSmoothingQuality = 'high'
  first.drawImage(image, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, side, side)
  while (current.width < edge) {
    const nextSize = Math.min(edge, current.width * 2)
    const next = document.createElement('canvas')
    next.width = nextSize
    next.height = nextSize
    const ctx = next.getContext('2d')
    if (!ctx) break
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(current, 0, 0, nextSize, nextSize)
    current = next
  }
  const ctx = current.getContext('2d')
  if (ctx) sharpenCanvas(ctx, current.width)
  return current
}

function sharpenCanvas(ctx: CanvasRenderingContext2D, size: number): void {
  const frame = ctx.getImageData(0, 0, size, size)
  const src = frame.data
  const copy = new Uint8ClampedArray(src)
  const amount = 0.55
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const i = (y * size + x) * 4
      for (let c = 0; c < 3; c += 1) {
        const center = copy[i + c] ?? 0
        const around = ((copy[i - 4 + c] ?? 0) + (copy[i + 4 + c] ?? 0) + (copy[i - size * 4 + c] ?? 0) + (copy[i + size * 4 + c] ?? 0)) * 0.25
        const next = center + (center - around) * amount
        src[i + c] = next < 0 ? 0 : next > 255 ? 255 : next
      }
    }
  }
  ctx.putImageData(frame, 0, 0)
}

function sharperAvatarUrl(url: string): string | null {
  let next = url
  next = next.replace(/~tplv-[^/?]+:\d+:\d+/, (token) => token.replace(/:\d+:\d+$/, ':720:720'))
  next = next.replace(/([^\d])(\d{2,3})x(\d{2,3})(?!\d)/g, (token, prefix: string, w: string, h: string) => {
    if (Math.max(Number(w), Number(h)) >= 720) return token
    return `${prefix}720x720`
  })
  return next !== url ? next : null
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
