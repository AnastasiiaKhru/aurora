import { Graphics, Text, TextStyle } from 'pixi.js'
import { DESIGN_WIDTH, DESIGN_HEIGHT, MAX_ATTACK_Y, MAX_IMPACT_Y, MAX_PLAYER_Y, attackDrawUnit, stageY } from '../broadcast/stage.ts'
import { director } from '../systems/GameDirector.ts'
import type { PlayerBody } from '../systems/PlayerSystem.ts'
import type { AttackCommand } from '../types/Battle.ts'
import type { TeamId } from '../types/Team.ts'
import { AUTO_BATTLE_CONFIG } from '../systems/autoBattle.ts'
import { attractModeConfig } from '../systems/attractMode.ts'
import { attackLab } from './attacks/lab.ts'
import { drawNpcAttack } from './attacks/npc.ts'
import { muzzle, playY, sideX, type Pt } from './attacks/motion.ts'
import { blasterKind, blasterPaint, drawBlaster, flightRate, visualPunch } from './attacks/blaster.ts'
import { cinemaOf, cinemaPlayerPhase, type CinemaSpec } from './attacks/cinema.ts'
import { paintMote, vortexPoint, type Fx, type Mote } from './attacks/play.ts'
import { growthFor, styleOf, type AttackStyle } from './attacks/style.ts'
import { hitPop, shootPop } from './vfxReactions.ts'
import { teamPalette } from '../config/effectConfig.ts'
import type { EffectsRenderer } from './EffectsRenderer.ts'
import { GlowPool } from './vfxGlow.ts'

interface Shot {
  commands: AttackCommand[]
  style: AttackStyle
  age: number
  fired: boolean[][]
  seed: number
  banner: boolean
  grew: boolean
  released: boolean
  jolted: boolean
  pushed: boolean
  flashed: boolean
  /** Real seconds before this bolt launches, so rapid likes stay separate. */
  hold: number
  /** Bits set once each bolt has thrown its impact sparks. */
  sparked: number
  /** Sender position when the shot fired, so it leaves the viewer's own circle. */
  origin: { x: number; y: number } | null
  /** Opposite-team players this shot connects with. */
  hitIds: string[]
  /** Avatar hits already applied, so a trimmed shot does not strike twice. */
  splashed: boolean
}

interface Wave {
  x: number
  y: number
  age: number
  life: number
  radius: number
  width: number
  color: number
}

const POOL = 160
/** Simultaneous shots on screen. Past this the oldest light shots land instantly instead of animating. */
const MAX_SHOTS = 110
const MAX_WAVES = 48

export class AttackRenderer {
  private shots: Shot[] = []
  private waves: Wave[] = []
  private readonly motes: Mote[] = []
  private readonly sparks: Fx[] = []
  private unit = 1
  private viewW = DESIGN_WIDTH
  private viewH = DESIGN_HEIGHT
  private readonly lights = new GlowPool()
  private readonly banner: Text
  private readonly effects: EffectsRenderer
  private premium = 0
  constructor(effects: EffectsRenderer) {
    this.effects = effects
    const glowIndex = effects.world.getChildIndex(effects.glowGfx)
    effects.world.addChildAt(this.lights.root, glowIndex + 1)
    this.banner = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Outfit, sans-serif',
        fontSize: 20,
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
    this.bind()
  }

  private readonly deliver = (command: AttackCommand): boolean => this.spawnImmediate(command)

  /** Take the spawn hook and any attacks that arrived before the stage was ready. */
  private bind(): void {
    director.attacks.spawnNow = this.deliver
    const waiting = director.attacks.pull(0)
    for (const command of waiting) {
      if (!this.spawnImmediate(command)) director.attacks.defer(command)
    }
  }

  /** Drop the live spawn hook so a destroyed stage cannot receive new shots. */
  release(): void {
    if (director.attacks.spawnNow === this.deliver) director.attacks.spawnNow = null
  }

  reset(): void {
    this.shots = []
    this.waves = []
    this.sparks.length = 0
    this.premium = 0
    this.banner.visible = false
    for (const mote of this.motes) mote.on = false
  }

  update(dt: number, width: number, height: number): void {
    if (director.attacks.spawnNow !== this.deliver) this.bind()
    const status = director.battle.status
    if (status !== 'running' && this.shots.length > 0) this.reset()
    const lab = Math.max(0.25, Math.min(2.4, attackLab.speed))
    if (status === 'running') this.intake()

    const g = this.effects.attackGfx
    const glow = this.effects.glowGfx
    g.clear()
    glow.clear()
    this.lights.begin()
    director.cinemaLive = false
    this.unit = Math.max(1, height / 760)
    this.viewW = width
    this.viewH = height
    const floor = stageY(MAX_ATTACK_Y, height)
    this.showSwitches(width, height)
    const crowd = this.shots.length

    for (const shot of this.shots) {
      const cmd = shot.commands[0]
      if (!cmd) continue
      if (shot.hold > 0) {
        shot.hold -= dt
        if (shot.hold > 0) continue
        shot.hold = 0
      }
      const rate = (cmd.npcKind ? 4 : flightRate(cmd)) * lab
      const local = dt * rate
      shot.age += local
      const ends = endsOf(cmd, width, height, shot.origin)
      ends.to.y = Math.min(ends.to.y, floor)
      const t = cmd.duration <= 0 ? 1 : shot.age / cmd.duration
      const scene = cmd.npcKind || cmd.ambient ? null : cinemaOf(cmd)
      const power = Math.max(1, cmd.power ?? 1)
      const unit = scene
        ? Math.max(attackDrawUnit(shot.style, height), width / 170) * Math.sqrt(power)
        : attackDrawUnit(shot.style, height) * power
      if (scene) director.cinemaLive = true
      if (shot.age < local * 1.5 || (scene && !shot.grew)) this.wind(shot, scene)
      const body = cmd.npcKind ? undefined : sender(cmd)
      const radius = ((body?.motionR || 41) * width) / DESIGN_WIDTH
      const nose = muzzle(ends.from, ends.to, cmd.npcKind ? 18 * unit : Math.max(16, radius * 0.98))
      if (!shot.flashed) {
        shot.flashed = true
        this.launchFlash(cmd, nose, body?.id)
      }
      const actor = scene ? body : undefined
      if (scene && actor) this.driveCinema(actor.id, cmd.id, scene, t)
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
      } else {
        drawBlaster({
          g,
          glow,
          from: nose,
          to: ends.to,
          t: Math.max(0, t),
          age: shot.age,
          seed: shot.seed,
          command: cmd,
          scale: (width / DESIGN_WIDTH) * visualPunch(cmd),
          quiet: crowd > 18,
          sparked: shot.sparked,
          aims: shot.hitIds.length > 1 ? hitPoints(cmd, shot.hitIds, width, height) : undefined,
          markSparked: (bit) => {
            shot.sparked |= bit
          },
          emit: (mote) => this.spawnMote(mote, floor),
          orb: (x, y, size, color, alpha) => this.lights.orb(x, y, size, color, alpha),
        })
      }
      this.resolve(shot, t, ends, width, height)
      if (scene) this.cinemaForce(shot, scene, t, cmd, ends, width, height)
      if (shot.style === 'vortex' && !scene) this.lift(cmd.team, vortexPoint(nose, ends.to, t, shot.age, shot.seed, unit), width, height)
    }

    this.shots = this.shots.filter((shot) => {
      const cmd = shot.commands[0]
      const tail = shot.style === 'pulse' ? 0.18 : shot.style === 'eclipse' ? 0.35 : 0.4
      const alive = !!cmd && (shot.hold > 0 || shot.age <= cmd.duration + tail)
      if (!alive && cmd && !cmd.ambient) {
        const body = sender(cmd)
        if (body) director.players.releaseCinema(body.id)
      }
      return alive
    })
    this.stepWaves(g, glow, dt)
    this.stepMotes(g, dt, floor)
    if (this.premium > 0) this.premium = Math.max(0, this.premium - dt)
    this.lights.end()
    this.drawBanner(width, height)
  }

  private intake(): void {
    const majors = this.majorCount()
    const pulled = director.attacks.pull(majors)
    for (const cmd of pulled) {
      if (!this.spawnImmediate(cmd)) director.attacks.defer(cmd)
    }
  }

  /**
   * Creates the projectile in the call that received the attack.
   * Avatar pulse and sound run after the shot exists, still in that same turn.
   * Ambient filler waits only while a major viewer attack is already on screen.
   */
  private spawnImmediate(cmd: AttackCommand): boolean {
    if (cmd.ambient && cmd.rarity !== 'micro' && cmd.rarity !== 'small' && this.majorCount() > 0) return false
    if (cmd.npcKind) {
      const shot = this.make([cmd], 'pulse')
      this.shots.push(shot)
      this.trim()
      return true
    }
    const style = styleOf(cmd)
    if (style === 'pulse' && cmd.giftName === 'Like') {
      const flying = this.shots.reduce((n, shot) => n + (shot.commands[0]?.giftName === 'Like' ? 1 : 0), 0)
      if (flying >= 22) {
        this.settle(this.make([cmd], style))
        return true
      }
    }
    const shot = this.make([cmd], style)
    this.shots.push(shot)
    this.arm(shot)
    this.trim()
    return true
  }

  private majorCount(): number {
    return this.shots.filter((shot) => {
      const cmd = shot.commands[0]
      return !!cmd && !cmd.ambient && (cmd.rarity === 'legendary' || cmd.rarity === 'large')
    }).length
  }

  /** Avatar flash for a shot that was just created, before the next paint. */
  private arm(shot: Shot): void {
    const cmd = shot.commands[0]
    if (!cmd || shot.flashed) return
    const ends = endsOf(cmd, this.viewW, this.viewH, shot.origin)
    const body = cmd.npcKind ? undefined : sender(cmd)
    const radius = ((body?.motionR || 41) * this.viewW) / DESIGN_WIDTH
    const nose = muzzle(ends.from, ends.to, cmd.npcKind ? 18 : Math.max(16, radius * 0.98))
    shot.flashed = true
    this.launchFlash(cmd, nose, body?.id)
  }

  private make(commands: AttackCommand[], style: AttackStyle): Shot {
    const first = commands[0]!
    const body = first.npcKind ? undefined : sender(first)
    const shot: Shot = {
      commands,
      style,
      age: 0,
      fired: commands.map((cmd) => cmd.impacts.map(() => false)),
      seed: Math.random() * 6.28,
      banner: false,
      grew: false,
      released: false,
      jolted: false,
      pushed: false,
      flashed: false,
      hold: 0,
      sparked: 0,
      origin: body ? { x: body.x, y: body.y } : null,
      hitIds: splashIds(first),
      splashed: false,
    }
    director.sound.onAttackStart(first)
    return shot
  }

  private trim(): void {
    let excess = this.shots.length - MAX_SHOTS
    if (excess <= 0) return
    const keep: Shot[] = []
    for (const shot of this.shots) {
      const cmd = shot.commands[0]
      const light = !cmd || cmd.ambient || cmd.rarity === 'micro'
      if (excess > 0 && light) {
        this.settle(shot)
        excess -= 1
        continue
      }
      keep.push(shot)
    }
    while (keep.length > MAX_SHOTS) this.settle(keep.shift()!)
    this.shots = keep
  }

  /** Lands every remaining hit of a shot without drawing it, so trimming never loses damage. */
  private settle(shot: Shot): void {
    shot.commands.forEach((cmd, index) => {
      const flags = shot.fired[index]
      cmd.impacts.forEach((_, hit) => {
        if (!flags || flags[hit]) return
        flags[hit] = true
        director.onImpact(cmd, cmd.toX, cmd.toY, hit)
        if (!cmd.npcKind && shot.hitIds.length > 0) director.spendHitPoints(cmd, shot.hitIds.length)
      })
    })
    this.landSplash(shot)
    const cmd = shot.commands[0]
    if (cmd && !cmd.ambient && !cmd.npcKind) {
      const body = sender(cmd)
      if (body) director.players.releaseCinema(body.id)
    }
  }

  private launchFlash(cmd: AttackCommand, at: Pt, shooterId?: string): void {
    if (cmd.npcKind || cmd.ambient) return
    if (shooterId) {
      director.players.cast(shooterId, 1, 0, false)
      shootPop(shooterId)
    }
    const paint = blasterPaint(cmd)
    const kind = blasterKind(cmd)
    const radius = (kind === 'like' ? 18 : kind === 'big' ? 36 : 24) * Math.min(this.unit, 1.7)
    this.addWave(at.x, at.y, radius, kind === 'like' ? 0.1 : 0.14, paint.core, kind === 'like' ? 2.6 : 3.4)
  }

  private impactBurst(cmd: AttackCommand, point: Pt): void {
    if (cmd.npcKind || cmd.ambient) return
    const paint = blasterPaint(cmd)
    const kind = blasterKind(cmd)
    if (kind === 'big') this.premium = 0
    const radius = (kind === 'like' ? 28 : kind === 'follow' || kind === 'share' ? 40 : kind === 'small' ? 48 : kind === 'medium' ? 64 : 96) * Math.min(this.unit, 1.65)
    this.addWave(point.x, point.y, radius, kind === 'like' ? 0.16 : 0.28, paint.core, kind === 'like' ? 3.2 : 5)
    this.addWave(point.x, point.y, radius * 0.55, 0.14, paint.hot, 2.4)
    if (kind === 'medium' || kind === 'big') this.addWave(point.x, point.y, radius * 1.35, 0.36, 0xffffff, 3.2)
    const sparks = kind === 'like' ? 6 : kind === 'big' ? 16 : 10
    this.effects.combat.spawn('spark', point.x, point.y, sparks, { color: paint.core, scale: kind === 'big' ? 1.35 : 0.95, speed: 1.15 })
    if (kind === 'medium' || kind === 'big') {
      this.effects.combat.spawn('explosion', point.x, point.y, kind === 'big' ? 12 : 7, { color: paint.glow, scale: kind === 'big' ? 1.25 : 0.85, speed: 1 })
    }
    if (kind === 'big' && attackLab.shake > 0.05) this.effects.addShake('medium')
  }

  private addWave(x: number, y: number, radius: number, life: number, color: number, width: number): void {
    if (this.waves.length >= MAX_WAVES) this.waves.shift()
    this.waves.push({ x, y, age: 0, life, radius, width, color })
  }

  private stepWaves(g: Graphics, glow: Graphics, dt: number): void {
    if (this.waves.length === 0) return
    for (const wave of this.waves) {
      wave.age += dt
      const u = Math.min(1, wave.age / wave.life)
      const r = wave.radius * (1 - (1 - u) * (1 - u) * (1 - u))
      const fade = 1 - u
      g.circle(wave.x, wave.y, Math.max(1, r)).stroke({ width: Math.max(0.6, wave.width * fade), color: wave.color, alpha: 0.95 * fade })
      if (wave.radius > 40) glow.circle(wave.x, wave.y, Math.max(1, r * 0.82)).stroke({ width: wave.width * 2 * fade, color: wave.color, alpha: 0.22 * fade })
    }
    this.waves = this.waves.filter((wave) => wave.age < wave.life)
  }

  private showSwitches(width: number, height: number): void {
    for (const note of director.takeSwitchNotes()) {
      const old = note.fromTeam === 'red' ? teamPalette.red : teamPalette.blue
      const fresh = note.team === 'red' ? teamPalette.red : teamPalette.blue
      const ox = note.fromX * width
      const oy = playY(note.fromY, height)
      this.addWave(ox, oy, 46 * this.unit, 0.3, old, 3)
      this.effects.combat.spawn('spark', ox, oy, 14, { color: old })
      const body = director.players.bodies.get(note.id)
      if (!body) continue
      const nx = body.x * width
      const ny = playY(body.y, height)
      this.addWave(nx, ny, 56 * this.unit, 0.36, fresh, 3.5)
      this.effects.combat.spawn('spark', nx, ny, 18, { color: fresh })
      this.effects.spawnTag(nx, ny - 58 * this.unit, note.text, note.team)
    }
  }

  private driveCinema(id: string, token: number, spec: CinemaSpec, t: number): void {
    const rawPhase = cinemaPlayerPhase(spec, t)
    const phase = rawPhase < 3 ? 3 : rawPhase
    director.players.directCinema(id, {
      token,
      phase,
      scale: 1.08,
      speed: 1,
      move: 0,
      dash: 0,
      trail: phase === 4 ? 0.2 : 0.35,
      jitter: 0,
    })
  }

  private cinemaForce(shot: Shot, spec: CinemaSpec, t: number, cmd: AttackCommand, ends: { from: Pt; to: Pt }, width: number, height: number): void {
    const enemy: TeamId = cmd.team === 'red' ? 'blue' : 'red'
    const nx = ends.to.x / width
    const ny = ends.to.y / height
    const hit = spec.impacts[spec.impacts.length - 1] ?? 0.75
    const apex = spec.id === 'dragon' || spec.id === 'meteor' || spec.id === 'blackhole'
    const pullIn = spec.id === 'vortex' || spec.id === 'blackhole'
    if (t > spec.chargeEnd && t < hit) {
      const tug = apex ? (spec.id === 'blackhole' ? 0.072 : 0.042) : pullIn ? 0.03 : 0.016
      director.players.attract(enemy, nx, ny, tug, pullIn)
    }
    if (t >= hit && !shot.pushed) {
      shot.pushed = true
      const blast = apex ? (spec.id === 'blackhole' ? 1.9 : 1.55) : 1.05
      director.players.attract(enemy, nx, ny, blast, false)
      director.players.wave(enemy, nx, ny, apex ? 1.65 : 1.05)
      if (!shot.jolted) {
        shot.jolted = true
        director.players.jolt(enemy, nx, ny)
      }
      director.teamFlash[enemy] = 1
      director.hitStop = Math.max(director.hitStop, apex ? 0.18 : 0.1)
      director.cinematic = Math.max(director.cinematic, apex ? 0.92 : 0.55)
    }
  }

  private wind(shot: Shot, scene: CinemaSpec | null): void {
    const cmd = shot.commands[0]
    if (!cmd) return
    const body = sender(cmd)
    if (!body) return
    if (scene) {
      if (!shot.grew) {
        shot.grew = true
        body.power = Math.min(0.32, body.power + growthFor(shot.style) * Math.min(4, shot.commands.length))
      }
      return
    }
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
    director.players.cast(body.id, 1, growthFor(shot.style) * Math.min(4, shot.commands.length), shot.style === 'comet')
  }

  /** Shows the points taken off every person this hit reached, and subtracts them from that team. */
  private showPoints(cmd: AttackCommand, spots: Pt[], style: AttackStyle, height: number): void {
    const each = director.spendHitPoints(cmd, spots.length)
    if (each < 1) return
    const lift = 34 * attackDrawUnit(style, height)
    for (const spot of spots) this.effects.spawnDamage(spot.x, spot.y - lift, each, true, true, cmd.team)
  }

  /** Applies the extra avatar hits once, including when a shot is trimmed before it draws. */
  private landSplash(shot: Shot): void {
    if (shot.splashed) return
    const cmd = shot.commands[0]
    if (!cmd || cmd.ambient || cmd.npcKind || shot.hitIds.length < 2) return
    shot.splashed = true
    director.splashStrike(cmd, shot.hitIds)
    const dramatic = shot.style === 'eclipse' || shot.style === 'planet'
    const heavy = shot.style === 'maple' || shot.style === 'star' || shot.style === 'vortex' || shot.style === 'planet' || shot.style === 'crystal' || shot.style === 'eclipse'
    const pixels = shot.style === 'pulse' ? 5 : dramatic ? 22 : heavy ? 11 : 7
    const dir = cmd.team === 'red' ? 1 : -1
    for (const id of shot.hitIds) {
      if (id === cmd.targetId) continue
      hitPop(id, dir, -0.2, pixels, heavy)
    }
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
        if (hit === 0) this.impactBurst(cmd, point)
        if (!cmd.ambient || shot.style !== 'pulse') this.react(shot.style, cmd.team, cmd.targetId, point, width, height)
        const spots = cmd.npcKind ? [] : hitPoints(cmd, shot.hitIds, width, height)
        if (hit === 0) this.landSplash(shot)
        if (spots.length > 0) this.showPoints(cmd, spots, shot.style, height)
        else if (!cmd.ambient && shot.style === 'pulse') likeSum += dealt
        else if (!cmd.ambient && dealt >= 1) this.effects.spawnDamage(point.x, point.y - (dealt >= 1500 ? 56 : 34) * attackDrawUnit(shot.style, height), dealt)
        if (!cmd.ambient && (cmd.rarity === 'legendary' || cmd.rarity === 'large') && hit === 0) {
          director.hitStop = Math.max(director.hitStop, cmd.rarity === 'legendary' ? 0.07 : 0.045)
        }
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
    const dramatic = style === 'eclipse' || style === 'planet'
    const power = style === 'pulse' ? 0.28 : style === 'comet' || style === 'portal' || style === 'rose' ? 0.62 : dramatic ? 1.35 : style === 'crystal' ? 1.15 : 0.86
    director.players.flinch(enemy, nx, ny, power)
    const heavy = style === 'maple' || style === 'star' || style === 'vortex' || style === 'planet' || style === 'crystal' || style === 'eclipse'
    const pixels = style === 'pulse' ? 5 : dramatic ? 22 : heavy ? 11 : 7
    const dir = team === 'red' ? 1 : -1
    const marked = targetId ? director.players.bodies.get(targetId) : undefined
    const knock = (id: string) => hitPop(id, dir, -0.2, pixels, heavy)
    if (marked && marked.team === enemy && marked.dying <= 0) knock(marked.id)
    const reach = dramatic ? 0.55 : 0.08
    for (const body of director.players.bodies.values()) {
      if (body.team !== enemy || body.dying > 0 || body.id === marked?.id) continue
      if (Math.hypot(body.x - nx, body.y - ny) > reach) continue
      knock(body.id)
      if (dramatic) body.crack = Math.max(body.crack, style === 'eclipse' ? 1 : 0.75)
    }
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
      if (cmd.ambient || cmd.giftName === 'Like' || cmd.giftName === 'Comment' || cmd.giftName === 'Follow' || cmd.giftName === 'Share') continue
      const showFor = cmd.rarity === 'legendary' || cmd.rarity === 'large' ? 1.15 : 0.9
      if (cmd.rarity !== 'micro' && shot.age > 0.08 && shot.age < showFor) {
        const premium = cmd.rarity === 'large' || cmd.rarity === 'legendary'
        text = premium ? `👑 @${cmd.username}\nPOWER ACTIVATED` : `@${cmd.username}\nPOWER ACTIVATED`
        const body = sender(cmd)
        at = body ? { x: body.x * width, y: playY(body.y, height) } : endsOf(cmd, width, height).from
        if (premium && Math.abs(at.x - width / 2) < width * 0.14) at = { x: at.x + (cmd.team === 'red' ? -64 : 64) * this.unit, y: at.y }
        break
      }
      if (shot.style === 'pulse' && cmd.combo >= 10 && shot.age < 0.7) {
        text = cmd.combo >= 100 ? 'AURORA STREAM' : `x${cmd.combo}`
        at = endsOf(cmd, width, height).from
      }
    }
    this.banner.visible = text.length > 0
    this.banner.style.fontSize = text.startsWith('👑') ? 15 : 20
    if (!at || !text) return
    this.banner.text = text
    const bannerY = Math.min(stageY(MAX_PLAYER_Y, height), Math.max(stageY(640, height), at.y - 28 * this.unit))
    this.banner.position.set(at.x, bannerY)
  }
}

const SPLASH_CAP = 4

/** Living opponents nearest the aim point, with the marked target first. */
function splashIds(cmd: AttackCommand): string[] {
  if (cmd.npcKind) return []
  const enemy: TeamId = cmd.team === 'red' ? 'blue' : 'red'
  const visible: { id: string; d: number }[] = []
  const hidden: { id: string; d: number }[] = []
  for (const body of director.players.bodies.values()) {
    if (body.team !== enemy || body.dying > 0 || body.hp <= 0) continue
    const item = { id: body.id, d: Math.hypot(body.x - cmd.toX, body.y - cmd.toY) }
    if (body.shown === 0) hidden.push(item)
    else visible.push(item)
  }
  const pool = visible.length > 0 ? visible : hidden
  pool.sort((a, b) => {
    if (a.id === cmd.targetId) return -1
    if (b.id === cmd.targetId) return 1
    return a.d - b.d
  })
  const limit = cmd.rarity === 'micro' || cmd.giftName === 'Like' || cmd.giftName === 'Comment' ? 3 : SPLASH_CAP
  return pool.slice(0, limit).map((item) => item.id)
}

function hitPoints(cmd: AttackCommand, ids: string[], width: number, height: number): Pt[] {
  const enemy: TeamId = cmd.team === 'red' ? 'blue' : 'red'
  const floor = stageY(MAX_IMPACT_Y, height)
  const points: Pt[] = []
  for (const id of ids) {
    const body = director.players.bodies.get(id)
    if (!body || body.team !== enemy || body.dying > 0) continue
    points.push({
      x: sideX(enemy, body.x * width, width),
      y: Math.min(floor, playY(body.y, height)),
    })
  }
  return points
}

function endsOf(cmd: AttackCommand, width: number, height: number, origin: { x: number; y: number } | null = null): { from: Pt; to: Pt } {
  const enemy: TeamId = cmd.team === 'red' ? 'blue' : 'red'
  const fromX = origin?.x ?? cmd.fromX
  const fromY = origin?.y ?? cmd.fromY
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
    from: { x: sideX(cmd.team, fromX * width, width), y: playY(fromY, height) },
    to: { x: sideX(enemy, toX * width, width), y: playY(toY, height) },
  }
}

function sender(cmd: AttackCommand): PlayerBody | undefined {
  const wanted = cmd.username.trim().toLowerCase()
  let best: PlayerBody | undefined
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
