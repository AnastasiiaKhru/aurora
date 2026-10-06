import { Graphics, Text, TextStyle } from 'pixi.js'
import { MAX_ATTACK_Y, MAX_IMPACT_Y, MAX_PLAYER_Y, attackDrawUnit, stageY } from '../broadcast/stage.ts'
import { director } from '../systems/GameDirector.ts'
import type { AttackCommand } from '../types/Battle.ts'
import type { TeamId } from '../types/Team.ts'
import { AUTO_BATTLE_CONFIG } from '../systems/autoBattle.ts'
import { attractModeConfig } from '../systems/attractMode.ts'
import { attackLab } from './attacks/lab.ts'
import { drawNpcAttack } from './attacks/npc.ts'
import { muzzle, playY, sideX, type Pt } from './attacks/motion.ts'
import { drawAttack, paintMote, vortexPoint, type Fx, type Mote } from './attacks/play.ts'
import { growthFor, motifOf, scaleFor, styleOf, type AttackStyle } from './attacks/style.ts'
import type { EffectsRenderer } from './EffectsRenderer.ts'
import { GlowPool } from './vfxGlow.ts'

interface Shot {
  commands: AttackCommand[]
  style: AttackStyle
  age: number
  fired: boolean[][]
  seed: number
  banner: boolean
}

const POOL = 160

export class AttackRenderer {
  private shots: Shot[] = []
  private readonly motes: Mote[] = []
  private readonly sparks: Fx[] = []
  private unit = 1
  private readonly lights = new GlowPool()
  private readonly banner: Text
  private readonly effects: EffectsRenderer
  constructor(effects: EffectsRenderer) {
    this.effects = effects
    const glowIndex = effects.world.getChildIndex(effects.glowGfx)
    effects.world.addChildAt(this.lights.root, glowIndex + 1)
    this.banner = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Outfit, sans-serif',
        fontSize: 15,
        fontWeight: '800',
        fill: 0xfff6ea,
        letterSpacing: 1.4,
      }),
    })
    this.banner.anchor.set(0.5, 1)
    this.banner.visible = false
    effects.world.addChild(this.banner)
    for (let i = 0; i < POOL; i += 1) {
      this.motes.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, rot: 0, spin: 0, grav: 0, color: 0xffffff, kind: 0, on: false })
    }
  }

  reset(): void {
    this.shots = []
    this.sparks.length = 0
    this.banner.visible = false
    for (const mote of this.motes) mote.on = false
  }

  update(dt: number, width: number, height: number): void {
    const status = director.battle.status
    if (status !== 'running' && this.shots.length > 0) this.reset()
    const speed = Math.max(0.25, Math.min(2.4, attackLab.speed))
    const slowed = director.hitStop > 0 ? 0.38 : 1
    if (status === 'running') this.intake()

    const g = this.effects.attackGfx
    const glow = this.effects.glowGfx
    g.clear()
    glow.clear()
    this.lights.begin()
    this.unit = Math.max(1, height / 760)
    const floor = stageY(MAX_ATTACK_Y, height)

    for (const shot of this.shots) {
      const local = dt * speed * (shot.style === 'eclipse' ? 1 : slowed)
      shot.age += local
      const cmd = shot.commands[0]
      if (!cmd) continue
      const ends = endsOf(cmd, width, height)
      ends.to.y = Math.min(ends.to.y, floor)
      const unit = attackDrawUnit(shot.style, height)
      const t = cmd.duration <= 0 ? 1 : shot.age / cmd.duration
      if (shot.age < local * 1.5) this.wind(shot)
      if (shot.style === 'eclipse' && shot.age < 0.08) director.hitStop = Math.max(director.hitStop, 0.4)
      const nose = muzzle(ends.from, ends.to, 18 * unit)
      if (cmd.npcKind) {
        drawNpcAttack({
          g,
          glow,
          from: { x: nose.x, y: nose.y },
          to: ends.to,
          team: cmd.team,
          t: Math.max(0, t),
          age: shot.age,
          unit: unit * attractModeConfig.visualIntensity,
          kind: cmd.npcKind,
        })
      } else drawAttack({
        g,
        glow,
        from: { x: nose.x, y: nose.y },
        to: ends.to,
        team: cmd.team,
        t: Math.max(0, t),
        age: shot.age,
        unit,
        seed: shot.seed,
        motif: motifOf(cmd.giftName),
        style: shot.style,
        count: shot.commands.length,
        emit: (mote) => this.spawnMote(mote, floor),
        fx: (item) => {
          if (this.sparks.length < 24) this.sparks.push({ ...item, age: 0 })
        },
        orb: (x, y, size, color, alpha) => this.lights.orb(x, y, size, color, alpha),
        streak: (x, y, len, thick, rot, color, alpha) => this.lights.streak(x, y, len, thick, rot, color, alpha),
      })
      this.resolve(shot, t, ends, width, height)
      if (shot.style === 'vortex') this.lift(cmd.team, vortexPoint(nose, ends.to, t, shot.age, shot.seed, unit), width, height)
    }

    this.shots = this.shots.filter((shot) => {
      const cmd = shot.commands[0]
      return !!cmd && shot.age <= cmd.duration + (shot.style === 'eclipse' ? 0.35 : 0.4)
    })
    this.stepMotes(g, dt, floor)
    this.lights.end()
    this.drawBanner(width, height)
  }

  private intake(): void {
    const pulled = director.attacks.pull(this.shots.length)
    const likes = new Map<string, AttackCommand[]>()
    for (const cmd of pulled) {
      if (cmd.npcKind) {
        this.shots.push(this.make([cmd], 'pulse'))
        continue
      }
      const style = styleOf(cmd)
      if (style === 'pulse' && cmd.giftName === 'Like') {
        const key = `${cmd.team}:${cmd.fromX.toFixed(2)}:${cmd.fromY.toFixed(2)}`
        const list = likes.get(key) ?? []
        list.push(cmd)
        likes.set(key, list)
      } else {
        this.shots.push(this.make([cmd], style))
      }
    }
    for (const list of likes.values()) {
      const chunks: AttackCommand[][] = []
      for (let i = 0; i < list.length; i += 8) chunks.push(list.slice(i, i + 8))
      for (const chunk of chunks) this.shots.push(this.make(chunk, 'pulse'))
    }
    if (this.shots.length > 36) this.shots.splice(0, this.shots.length - 36)
  }

  private make(commands: AttackCommand[], style: AttackStyle): Shot {
    const shot: Shot = {
      commands,
      style,
      age: 0,
      fired: commands.map((cmd) => cmd.impacts.map(() => false)),
      seed: Math.random() * 6.28,
      banner: false,
    }
    director.sound.onAttackStart(commands[0]!)
    return shot
  }

  private wind(shot: Shot): void {
    const cmd = shot.commands[0]
    if (!cmd) return
    const body = sender(cmd)
    if (!body) return
    if (cmd.npcKind) {
      director.players.cast(body.id, 1.12, 0, false)
      return
    }
    if (cmd.ambient) {
      const peak = cmd.attackType === 'energy_bullet' && cmd.rarity === 'micro'
        ? AUTO_BATTLE_CONFIG.basicScale
        : AUTO_BATTLE_CONFIG.bigScale
      director.players.cast(body.id, peak, 0, false)
      return
    }
    director.players.cast(body.id, scaleFor(shot.style), growthFor(shot.style) * Math.min(4, shot.commands.length), shot.style === 'comet')
  }

  private resolve(shot: Shot, t: number, ends: { from: Pt; to: Pt }, width: number, height: number): void {
    let likeSum = 0
    shot.commands.forEach((cmd, index) => {
      cmd.impacts.forEach((at, hit) => {
        const flags = shot.fired[index]
        if (!flags || flags[hit] || t < at) return
        flags[hit] = true
        if (cmd.npcKind) {
          director.onImpact(cmd, ends.to.x / width, ends.to.y / height, hit)
          return
        }
        const spread = (hit - (cmd.impacts.length - 1) / 2) * 16 * attackDrawUnit(shot.style, height)
        const point = { x: ends.to.x, y: Math.min(stageY(MAX_IMPACT_Y, height), ends.to.y + spread) }
        const dealt = director.onImpact(cmd, point.x / width, point.y / height, hit)
        if (!cmd.ambient || shot.style !== 'pulse') this.react(shot.style, cmd.team, cmd.targetId, point, width, height)
        if (!cmd.ambient && shot.style === 'pulse') likeSum += dealt
        else if (!cmd.ambient && dealt >= 2) this.effects.spawnDamage(point.x, point.y - 14, dealt)
        if (hit === 0 && cmd.shake !== 'none' && shot.style !== 'pulse') {
          const level = cmd.shake === 'legendary' ? 'large' : cmd.shake
          if (attackLab.shake > 0.05) this.effects.addShake(level)
        }
      })
    })
    if (likeSum > 0) this.effects.spawnDamage(ends.to.x, ends.to.y - 12, likeSum)
  }

  private react(style: AttackStyle, team: TeamId, targetId: string | undefined, point: Pt, width: number, height: number): void {
    const enemy: TeamId = team === 'red' ? 'blue' : 'red'
    const nx = point.x / width
    const ny = point.y / height
    const power = style === 'pulse' ? 0.28 : style === 'comet' || style === 'portal' || style === 'rose' ? 0.62 : style === 'eclipse' || style === 'crystal' || style === 'planet' ? 1.15 : 0.86
    director.players.flinch(enemy, nx, ny, power)
    const marked = targetId ? director.players.bodies.get(targetId) : undefined
    if (!marked) return
    if (style === 'planet') director.players.pull(marked.id, nx, ny, 0.8)
    if (style === 'crystal' || style === 'eclipse' || style === 'maple') marked.crack = Math.max(marked.crack, style === 'eclipse' ? 1 : 0.7)
    if (style === 'crystal') marked.frost = 1
  }

  private lift(enemy: TeamId, point: Pt, width: number, height: number): void {
    for (const body of director.players.bodies.values()) {
      if (body.team === enemy || body.dying > 0) continue
      const dx = body.x - point.x / width
      const dy = body.y - point.y / height
      if (Math.hypot(dx, dy) > 0.12) continue
      body.lift = Math.max(body.lift, 0.85)
      body.spin = body.team === 'red' ? 0.4 : -0.4
    }
  }

  private spawnMote(mote: Omit<Mote, 'on' | 'max'> & { max?: number }, floor: number): void {
    if (mote.y > floor) return
    const slot = this.motes.find((item) => !item.on) ?? this.motes.reduce((oldest, item) => (item.life < oldest.life ? item : oldest))
    slot.on = true
    slot.x = mote.x
    slot.y = mote.y
    slot.vx = mote.vx
    slot.vy = mote.vy
    slot.life = mote.life
    slot.max = mote.max ?? mote.life
    slot.size = mote.size
    slot.rot = mote.rot
    slot.spin = mote.spin
    slot.grav = mote.grav
    slot.color = mote.color
    slot.kind = mote.kind
  }

  private stepMotes(g: Graphics, dt: number, floor: number): void {
    for (const mote of this.motes) {
      if (!mote.on) continue
      mote.life -= dt
      if (mote.life <= 0 || mote.y > floor) {
        mote.on = false
        continue
      }
      mote.vy += mote.grav * dt
      mote.x += mote.vx * dt
      mote.y += mote.vy * dt
      mote.rot += mote.spin * dt
      paintMote(g, mote)
    }
  }

  private drawBanner(width: number, height: number): void {
    let text = ''
    let at: Pt | null = null
    for (const shot of this.shots) {
      const cmd = shot.commands[0]
      if (!cmd) continue
      if (cmd.ambient) continue
      if (shot.style === 'eclipse' && shot.age > 0.35 && shot.age < 2.4) {
        text = `${cmd.username.toUpperCase()}  ·  LEGENDARY`
        at = endsOf(cmd, width, height).from
        break
      }
      if (shot.style === 'pulse' && cmd.combo >= 10 && shot.age < 0.7) {
        text = cmd.combo >= 100 ? 'AURORA STREAM' : `x${cmd.combo}`
        at = endsOf(cmd, width, height).from
      }
    }
    this.banner.visible = text.length > 0
    if (!at || !text) return
    this.banner.text = text
    const bannerY = Math.min(stageY(MAX_PLAYER_Y, height), Math.max(stageY(640, height), at.y - 28 * this.unit))
    this.banner.position.set(at.x, bannerY)
  }
}

function endsOf(cmd: AttackCommand, width: number, height: number): { from: Pt; to: Pt } {
  const enemy: TeamId = cmd.team === 'red' ? 'blue' : 'red'
  let toX = cmd.toX
  let toY = cmd.toY
  if (cmd.targetId) {
    const body = director.players.bodies.get(cmd.targetId)
    if (body && body.team === enemy && body.dying <= 0) {
      toX = body.x
      toY = body.y
    }
  }
  return {
    from: { x: sideX(cmd.team, cmd.fromX * width, width), y: playY(cmd.fromY, height) },
    to: { x: sideX(enemy, toX * width, width), y: playY(toY, height) },
  }
}

function sender(cmd: AttackCommand): { id: string } | undefined {
  const wanted = cmd.username.trim().toLowerCase()
  let best: { id: string } | undefined
  let score = 0.12
  for (const body of director.players.bodies.values()) {
    if (body.team !== cmd.team || body.dying > 0) continue
    const name = director.players.players.get(body.id)?.username.trim().toLowerCase()
    if (wanted && name === wanted) return body
    const dist = Math.hypot(body.x - cmd.fromX, body.y - cmd.fromY)
    if (dist < score) {
      score = dist
      best = body
    }
  }
  return best
}
