import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import { avatarCanvas } from '../utils/avatar.ts'
import { avatarRadius } from '../systems/PlayerSystem.ts'
import { director } from '../systems/GameDirector.ts'
import type { TeamId } from '../types/Team.ts'
import { easeOutCubic } from '../utils/math.ts'

const nameStyle = new TextStyle({
  fontFamily: 'Outfit, sans-serif',
  fontSize: 12,
  fill: 0xfff8f2,
  fontWeight: '600',
})

interface PlayerView {
  root: Container
  aura: Graphics
  frame: Graphics
  avatar: Sprite
  mask: Graphics
  name: Text
  radius: number
  team: TeamId
  textureKey: string
  signature: string
}

export class PlayerRenderer {
  private readonly views = new Map<string, PlayerView>()
  private readonly textures = new Map<string, Texture>()
  private readonly layer: Container

  constructor(layer: Container) {
    this.layer = layer
  }

  sync(width: number, height: number, time: number): void {
    const seen = new Set<string>()
    for (const body of director.players.bodies.values()) {
      const player = director.players.players.get(body.id)
      if (!player) continue
      seen.add(body.id)
      const radius = avatarRadius(director.players.count(body.team), width, height)
      let view = this.views.get(body.id)
      if (!view) {
        view = this.create(player.username, body.team)
        this.views.set(body.id, view)
        this.layer.addChild(view.root)
      }
      const selected = director.hud.selected?.id === body.id
      const crowned = director.topRedId === body.id || director.topBlueId === body.id
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
      }
      const appear = 0.62 + 0.38 * easeOutCubic(body.spawn)
      view.root.position.set(body.x * width, body.y * height)
      view.root.scale.set(appear * (1 + body.attack * 0.1))
      view.root.alpha = Math.min(1, body.spawn * 1.35)
      view.root.zIndex = Math.round(body.y * 1000)
      view.aura.alpha = 0.42 + Math.sin(time * 2.1 + body.phase) * 0.16 + (crowned ? 0.18 : 0)
      view.aura.scale.set(1 + Math.sin(time * 1.6 + body.phase) * 0.04)
      const showName = body.nameTime > 0 || selected || crowned
      view.name.visible = showName
      view.name.alpha = director.hud.selected?.id === body.id ? 1 : Math.min(1, body.nameTime > 0 ? body.nameTime : 0.85)
      view.name.text = player.username
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue
      view.root.destroy({ children: true })
      this.views.delete(id)
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
    const frame = new Graphics()
    const avatar = new Sprite(Texture.EMPTY)
    const mask = new Graphics()
    const name = new Text({ text: username, style: nameStyle })
    avatar.anchor.set(0.5)
    name.anchor.set(0.5, 0)
    root.addChild(aura, frame, avatar, mask, name)
    avatar.mask = mask
    const view: PlayerView = { root, aura, frame, avatar, mask, name, radius: -1, team, textureKey: '', signature: '' }
    return view
  }

  private paint(view: PlayerView, radius: number, team: TeamId, selected = false, crowned = false): void {
    const color = team === 'red' ? 0xff4b63 : 0x3d8dff
    const metal = team === 'red' ? 0xffd5cc : 0xd7e8ff
    view.aura.clear()
    view.aura.circle(0, 0, radius * 1.42).fill({ color, alpha: 0.14 })
    view.frame.clear()
    view.frame.circle(0, 0, radius * 1.02).stroke({ width: Math.max(1.4, radius * 0.09), color: metal, alpha: 0.95 })
    view.frame.circle(0, 0, radius * 0.9).stroke({ width: 1, color, alpha: 0.75 })
    view.frame.arc(0, 0, radius * 1.02, -2.45, -0.7).stroke({ width: 1.4, color: 0xffffff, alpha: 0.7 })
    if (team === 'red') {
      view.frame.poly([0, radius * 1.22, radius * 0.16, radius * 1.46, -radius * 0.16, radius * 1.46]).fill({ color, alpha: 0.95 })
    } else {
      view.frame.poly([
        0, radius * 1.18,
        radius * 0.13, radius * 1.34,
        0, radius * 1.5,
        -radius * 0.13, radius * 1.34,
      ]).fill({ color, alpha: 0.95 })
    }
    if (crowned) {
      view.frame.circle(0, 0, radius * 1.2).stroke({ width: 1.5, color: 0xe6c98a, alpha: 0.95 })
    }
    if (selected) {
      view.frame.circle(0, 0, radius * 1.32).stroke({ width: 1.4, color: 0xfff6ea, alpha: 0.8 })
    }
    view.mask.clear()
    view.mask.circle(0, 0, radius * 0.9).fill(0xffffff)
    view.avatar.width = radius * 1.8
    view.avatar.height = radius * 1.8
    view.name.y = radius * 1.52
    view.name.style.fontSize = Math.max(10, Math.round(radius * 0.42))
  }

  private textureFor(key: string, url: string): Texture {
    const cached = this.textures.get(key)
    if (cached) return cached
    const canvas = key.startsWith('remote:') ? null : avatarCanvas(key)
    if (canvas) {
      const texture = Texture.from(canvas)
      this.textures.set(key, texture)
      return texture
    }
    if (!url) return Texture.EMPTY
    const texture = Texture.from(url)
    this.textures.set(key, texture)
    return texture
  }
}
