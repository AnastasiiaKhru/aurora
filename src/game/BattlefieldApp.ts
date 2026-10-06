import { Application } from 'pixi.js'
import { DESIGN_HEIGHT, DESIGN_WIDTH, isCaptureMode, renderResolution } from '../broadcast/stage.ts'
import { director } from '../systems/GameDirector.ts'
import { AttackRenderer } from './AttackRenderer.ts'
import { EffectsRenderer } from './EffectsRenderer.ts'
import { PlayerRenderer } from './PlayerRenderer.ts'

export class BattlefieldApp {
  private app: Application | null = null
  private destroyed = false
  private effects: EffectsRenderer | null = null
  private players: PlayerRenderer | null = null
  private attacks: AttackRenderer | null = null
  private seenEpoch = director.epoch

  async start(host: HTMLElement): Promise<void> {
    const app = new Application()
    const resolution = renderResolution()
    const capture = isCaptureMode()
    const options = {
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      resolution,
      powerPreference: 'high-performance' as const,
      ...(capture ? {} : { resizeTo: host }),
    }
    try {
      await app.init({ ...options, preference: 'webgl' })
    } catch {
      await app.init({ ...options, resolution: 1, preference: 'webgl' })
    }
    if (capture) app.renderer.resize(DESIGN_WIDTH, DESIGN_HEIGHT)
    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true })
      return
    }
    this.app = app
    host.appendChild(app.canvas)
    this.effects = new EffectsRenderer()
    this.effects.mount(app.stage)
    this.players = new PlayerRenderer(this.effects.playerLayer)
    this.attacks = new AttackRenderer(this.effects)
    app.stage.eventMode = 'none'
    app.ticker.add(this.onTick)
    app.canvas.addEventListener('pointerdown', this.onPointer)
  }

  destroy(): void {
    this.destroyed = true
    const app = this.app
    if (!app) return
    app.canvas.removeEventListener('pointerdown', this.onPointer)
    app.ticker.remove(this.onTick)
    this.players?.reset()
    this.attacks?.reset()
    this.effects?.reset()
    app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true })
    this.app = null
  }

  private onTick = (): void => {
    const app = this.app
    const effects = this.effects
    const players = this.players
    const attacks = this.attacks
    if (!app || !effects || !players || !attacks) return
    if (director.epoch !== this.seenEpoch) {
      this.seenEpoch = director.epoch
      players.reset()
      attacks.reset()
      effects.reset()
    }
    const dt = Math.min(0.05, app.ticker.deltaMS / 1000)
    const width = app.screen.width
    const height = app.screen.height
    const status = director.battle.status
    const combatDt = status === 'running' ? dt : 0
    effects.update(dt, width, height)
    players.sync(width, height, effects.time)
    attacks.update(combatDt, width, height)
    const shake = effects.shakeOffset(dt)
    effects.world.position.set(shake.x, shake.y)
  }

  private onPointer = (event: PointerEvent): void => {
    const canvas = this.app?.canvas
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const nx = (event.clientX - rect.left) / rect.width
    const ny = (event.clientY - rect.top) / rect.height
    director.selectAt(nx, ny, rect.width, rect.height)
  }
}
