import { AVATAR_BASE, DESIGN_HEIGHT, DESIGN_WIDTH } from '../broadcast/stage.ts'
import { battleConfig } from '../config/battleConfig.ts'
import { ensureMotionFields, stepPlayerMotion, teamBox, type MotionMood, type PlayerMotionState } from './playerMotion.ts'
import type { LeaderboardEntry, Player } from '../types/Player.ts'
import type { TeamId } from '../types/Team.ts'
import { isNpcId } from './attractMode.ts'
import { claimDummyAvatar, isRemoteAvatar, releaseDummyAvatar, resetDummyAvatars } from '../utils/avatar.ts'
import { initialsOf } from '../utils/format.ts'
import { hashString } from '../utils/math.ts'
import { releaseName, resetNames, takeName } from '../utils/names.ts'

export interface PlayerBody {
  id: string
  team: TeamId
  homeX: number
  homeY: number
  x: number
  y: number
  phase: number
  spawn: number
  flinch: number
  flinchX: number
  flinchY: number
  attack: number
  grow: number
  growHold: number
  surge: number
  surgeHold: number
  hurt: number
  hp: number
  maxHp: number
  dying: number
  nameTime: number
  vx: number
  vy: number
  aimX: number
  aimY: number
  aimLeft: number
  cruise: number
  power: number
  poseScale: number
  poseVel: number
  poseSquash: number
  poseSquashVel: number
  poseRecoil: number
  poseRecoilVel: number
  poseSpin: number
  poseMode: number
  posePeak: number
  poseClock: number
  poseHold: number
  crown: number
  lift: number
  spin: number
  crack: number
  frost: number
  motion: PlayerMotionState
  persona: number
  goalWait: number
  goalSerial: number
  lean: number
  trail: number
  shown: number
  motionR: number
  cheer: number
  stun: number
  kick: number
  lunge: number
  speed: number
  curve: number
}

interface Bounds {
  x0: number
  x1: number
  y0: number
  y1: number
}

function teamBounds(team: TeamId): Bounds {
  const box = teamBox(team, false, AVATAR_BASE / 2)
  return {
    x0: box.x0 / DESIGN_WIDTH,
    x1: box.x1 / DESIGN_WIDTH,
    y0: box.y0 / DESIGN_HEIGHT,
    y1: box.y1 / DESIGN_HEIGHT,
  }
}

export class PlayerSystem {
  readonly players = new Map<string, Player>()
  readonly bodies = new Map<string, PlayerBody>()
  reserves: { red: number; blue: number } = { red: 0, blue: 0 }
  private seq = 1

  clear(): void {
    this.players.clear()
    this.bodies.clear()
    resetDummyAvatars()
    resetNames()
  }

  addGenerated(team: TeamId, relayout = true): Player {
    const username = takeName()
    return this.add(
      {
        id: `p${this.seq++}`,
        username,
        team,
        avatarUrl: '',
        avatarKey: '',
        initials: initialsOf(username),
      },
      relayout,
    )
  }

  add(
    input: {
      id: string
      username: string
      team: TeamId
      avatarUrl: string
      avatarKey: string
      initials: string
    },
    relayout = true,
  ): Player {
    const existing = this.players.get(input.id)
    if (existing) {
      if (isRemoteAvatar(input.avatarUrl)) this.refreshAvatar(input.id, input.avatarUrl)
      if (existing.team !== input.team) this.setTeam(input.id, input.team)
      return existing
    }
    const seed = hashString(input.id + input.username)
    const remote = isRemoteAvatar(input.avatarUrl)
    const art = remote
      ? { key: `remote:${input.avatarUrl.trim()}`, url: input.avatarUrl.trim() }
      : claimDummyAvatar(input.id, input.team, input.avatarUrl)
    const player: Player = {
      id: input.id,
      username: input.username,
      avatarUrl: art.url,
      avatarKey: art.key,
      initials: input.initials,
      team: input.team,
      giftValue: 0,
      battlePoints: 0,
      damageDealt: 0,
      giftCount: 0,
      largestCombo: 0,
      joinedAt: performance.now(),
    }
    const body: PlayerBody = {
      id: player.id,
      team: player.team,
      homeX: input.team === 'red' ? 0.2 : 0.8,
      homeY: 0.5,
      x: input.team === 'red' ? 0.02 : 0.98,
      y: 0.5,
      phase: (seed % 628) / 100,
      spawn: 0,
      flinch: 0,
      flinchX: 0,
      flinchY: 0,
      attack: 0,
      grow: 0,
      growHold: 0,
      surge: 0,
      surgeHold: 0,
      hurt: 0,
      hp: battleConfig.playerHealth,
      maxHp: battleConfig.playerHealth,
      dying: 0,
      nameTime: 2.4,
      vx: 0,
      vy: 0,
      aimX: 0,
      aimY: 0,
      aimLeft: 0,
      cruise: 0,
      power: 0,
      poseScale: 1,
      poseVel: 0,
      poseSquash: 1,
      poseSquashVel: 0,
      poseRecoil: 0,
      poseRecoilVel: 0,
      poseSpin: 0,
      poseMode: 0,
      posePeak: 1,
      poseClock: 0,
      poseHold: 0,
      crown: 0,
      lift: 0,
      spin: 0,
      crack: 0,
      frost: 0,
      motion: 'wander',
      persona: -1,
      goalWait: 0.6,
      goalSerial: 0,
      lean: 0,
      trail: 0,
      shown: 1,
      motionR: AVATAR_BASE / 2,
      cheer: 0,
      stun: 0,
      kick: 0,
      lunge: 0,
      speed: 0,
      curve: 0,
    }
    ensureMotionFields(body, player.username)
    this.players.set(player.id, player)
    this.bodies.set(player.id, body)
    if (relayout) this.layout(player.team)
    return player
  }

  hydrate(players: Player[], bodies: PlayerBody[]): void {
    const ids = new Set(players.map((player) => player.id))
    for (const id of this.players.keys()) {
      if (ids.has(id)) continue
      this.players.delete(id)
      this.bodies.delete(id)
    }
    resetDummyAvatars()
    for (const player of players) {
      this.players.set(player.id, player)
      if (!isRemoteAvatar(player.avatarUrl)) {
        const art = claimDummyAvatar(player.id, player.team, player.avatarUrl)
        player.avatarUrl = art.url
        player.avatarKey = art.key
      }
    }
    for (const body of bodies) {
      const next = { ...body }
      this.fillVitals(next)
      this.bodies.set(body.id, next)
    }
    this.layoutAll()
  }

  refreshAvatar(id: string, avatarUrl: string): void {
    const trimmed = avatarUrl.trim()
    if (!isRemoteAvatar(trimmed)) return
    const player = this.players.get(id)
    if (!player || player.avatarUrl === trimmed) return
    releaseDummyAvatar(id)
    player.avatarUrl = trimmed
    player.avatarKey = `remote:${trimmed}`
  }

  trimGenerated(keepRed: number, keepBlue: number): number {
    let removed = 0
    for (const [team, keep] of [['red', keepRed], ['blue', keepBlue]] as const) {
      const extras = [...this.players.values()]
        .filter((player) => player.team === team && /^p\d+$/.test(player.id))
        .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
        .slice(keep)
      for (const player of extras) {
        this.remove(player.id)
        removed += 1
      }
    }
    return removed
  }

  remove(id: string): void {
    const player = this.players.get(id)
    if (!player) return
    releaseDummyAvatar(id)
    releaseName(player.username)
    this.players.delete(id)
    this.bodies.delete(id)
    this.layout(player.team)
  }

  setTeam(id: string, team: TeamId): void {
    const player = this.players.get(id)
    const body = this.bodies.get(id)
    if (!player || !body || player.team === team) return
    const previous = player.team
    player.team = team
    body.team = team
    if (!isRemoteAvatar(player.avatarUrl)) {
      const url = player.avatarUrl
      releaseDummyAvatar(id)
      const art = claimDummyAvatar(id, team, url)
      player.avatarUrl = art.url
      player.avatarKey = art.key
    }
    body.spawn = 0
    body.nameTime = 2
    this.layout(previous)
    this.layout(team)
  }

  layoutAll(): void {
    this.layout('red')
    this.layout('blue')
  }

  update(dt: number, time: number, eliminate = true, mood: MotionMood = { finalTen: false, lead: null, hidden: false }): void {
    const gone: string[] = []
    const step = Math.min(dt, 0.05)
    const entries = []
    for (const body of this.bodies.values()) {
      this.fillVitals(body)
      const player = this.players.get(body.id)
      ensureMotionFields(body, player?.username ?? body.id)
      this.ensureMotion(body)
      body.spawn = Math.min(1, body.spawn + step * 2.5)
      body.flinch = Math.max(0, body.flinch - step * 2.2)
      body.attack = Math.max(0, body.attack - step * 2.4)
      body.hurt = Math.max(0, body.hurt - step * 1.7)
      if (body.growHold > 0) body.growHold = Math.max(0, body.growHold - step)
      else body.grow = Math.max(0, body.grow - step * 1.05)
      if (body.surgeHold > 0) body.surgeHold = Math.max(0, body.surgeHold - step)
      else body.surge = Math.max(0, body.surge - step * 5.5)
      if (eliminate && body.dying > 0 && !isNpcId(body.id)) {
        body.dying -= step
        if (body.dying <= 0) gone.push(body.id)
      }
      body.nameTime = Math.max(0, body.nameTime - step)
      body.lift = Math.max(0, body.lift - step * 1.6)
      body.spin *= Math.exp(-step * 2.4)
      body.crack = Math.max(0, body.crack - step * 0.7)
      body.frost = Math.max(0, body.frost - step * 0.65)
      this.stepPose(body, step)
      entries.push({ body, username: player?.username ?? body.id, points: player?.battlePoints ?? 0 })
    }
    this.reserves = stepPlayerMotion(entries, step, time, mood)
    if (eliminate) for (const id of gone) this.remove(id)
  }

  restoreForRound(): void {
    for (const player of this.players.values()) {
      player.giftValue = 0
      player.battlePoints = 0
      player.damageDealt = 0
      player.giftCount = 0
      player.largestCombo = 0
    }
    for (const body of this.bodies.values()) {
      this.fillVitals(body)
      body.hp = body.maxHp
      body.dying = 0
      body.hurt = 0
      body.attack = 0
      body.grow = 0
      body.growHold = 0
      body.surge = 0
      body.surgeHold = 0
      body.poseHold = 0
      body.flinch = 0
      body.flinchX = 0
      body.flinchY = 0
      body.spawn = 0
      body.nameTime = 0
      body.poseMode = 0
      body.poseClock = 0
      body.poseScale = 1
      body.posePeak = 1
      body.poseRecoil = 0
      body.vx = 0
      body.vy = 0
      body.cheer = 0
      body.stun = 0
      body.kick = 0
      body.lunge = 0
      body.lift = 0
      body.spin = 0
      body.goalWait = 0
      body.goalSerial = 0
      body.aimX = 0
      body.aimY = 0
    }
  }

  pulse(id: string): void {
    const body = this.bodies.get(id)
    if (!body) return
    body.attack = 1
    body.nameTime = Math.max(body.nameTime, 1.7)
  }

  swell(id: string, extra: number, hold: number): void {
    const body = this.bodies.get(id)
    if (!body || body.dying > 0) return
    body.surge = Math.max(body.surge, extra)
    body.surgeHold = Math.max(body.surgeHold, hold)
    body.attack = 1
    body.nameTime = Math.max(body.nameTime, 1.8)
  }

  charge(id: string): void {
    const body = this.bodies.get(id)
    if (!body || body.dying > 0) return
    body.grow = 1
    body.growHold = 0.78
    body.nameTime = Math.max(body.nameTime, 1.8)
  }

  strike(id: string, amount: number): boolean {
    const body = this.bodies.get(id)
    if (!body || body.dying > 0 || isNpcId(id)) return false
    this.fillVitals(body)
    body.hp = Math.max(0, body.hp - amount)
    body.hurt = 1
    body.flinch = Math.max(body.flinch, 1)
    if (body.hp > 0) return false
    body.hp = 0
    body.dying = battleConfig.playerDeathSeconds
    return true
  }

  cast(id: string, peak: number, growth: number, crown = false): void {
    const body = this.bodies.get(id)
    if (!body || body.dying > 0) return
    this.fillVitals(body)
    body.power = Math.min(0.32, body.power + growth)
    if (crown) body.crown = 1
    if (body.poseMode > 0) {
      body.posePeak = Math.max(body.posePeak, peak)
      return
    }
    body.poseMode = 1
    body.posePeak = peak
    body.poseClock = 0
    body.poseVel = 0
  }

  pull(id: string, x: number, y: number, power: number): void {
    const body = this.bodies.get(id)
    if (!body || body.dying > 0) return
    const dx = x - body.x
    const dy = y - body.y
    const dist = Math.hypot(dx, dy) || 1
    body.flinch = Math.max(body.flinch, power)
    body.flinchX = dx / dist
    body.flinchY = dy / dist
  }

  boost(id: string, amount: number, hold: number): void {
    const body = this.bodies.get(id)
    if (!body || body.dying > 0) return
    body.grow = Math.max(body.grow, amount)
    body.growHold = Math.max(body.growHold, hold)
    body.attack = Math.max(body.attack, 0.4)
    body.nameTime = Math.max(body.nameTime, 1.4)
  }

  livingPoint(team: TeamId, preferId?: string): { id: string; x: number; y: number } | null {
    const preferred = preferId ? this.bodies.get(preferId) : undefined
    if (preferred && preferred.team === team && preferred.dying <= 0 && preferred.hp > 0) {
      return { id: preferred.id, x: preferred.x, y: preferred.y }
    }
    const bodies = this.teamBodies(team).filter((body) => body.dying <= 0 && body.hp > 0 && body.shown !== 0)
    const pool = bodies.length > 0 ? bodies : this.teamBodies(team).filter((body) => body.dying <= 0 && body.hp > 0)
    if (pool.length === 0) return null
    const body = pool[Math.floor(Math.random() * pool.length)]!
    return { id: body.id, x: body.x, y: body.y }
  }

  flinch(team: TeamId, x: number, y: number, power: number): void {
    for (const body of this.bodies.values()) {
      if (body.team !== team) continue
      const dx = body.x - x
      const dy = body.y - y
      const dist = Math.hypot(dx, dy)
      if (dist > 0.2) continue
      const strength = (1 - dist / 0.2) * power
      body.flinch = Math.max(body.flinch, strength)
      body.attack = Math.max(body.attack, Math.min(1, strength))
      body.flinchX = dist > 0.001 ? dx / dist : 0
      body.flinchY = dist > 0.001 ? dy / dist : -1
    }
  }

  impactPoint(team: TeamId): { x: number; y: number } {
    const bodies = this.teamBodies(team)
    if (bodies.length > 0 && Math.random() < 0.78) {
      const visible = bodies.filter((body) => body.shown !== 0)
      const pool = visible.length > 0 ? visible : bodies
      const body = pool[Math.floor(Math.random() * pool.length)]!
      return { x: body.x, y: body.y }
    }
    const bounds = teamBounds(team)
    return {
      x: bounds.x0 + Math.random() * (bounds.x1 - bounds.x0),
      y: bounds.y0 + Math.random() * (bounds.y1 - bounds.y0),
    }
  }

  pick(nx: number, ny: number, width: number, height: number): string | null {
    let best: string | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const body of this.bodies.values()) {
      const radius = avatarRadius(this.count(body.team), width, height) * 1.2
      const dx = (body.x - nx) * width
      const dy = (body.y - ny) * height
      const dist = dx * dx + dy * dy
      if (dist <= radius * radius && dist < bestDist) {
        best = body.id
        bestDist = dist
      }
    }
    return best
  }

  shownCount(team: TeamId): number {
    return Math.max(0, this.count(team) - this.reserves[team])
  }

  cheer(team: TeamId): void {
    for (const body of this.bodies.values()) {
      if (body.team !== team || body.dying > 0 || body.shown === 0) continue
      body.cheer = 0.75
      body.kick = 0
    }
  }

  previewMotion(kind: 'wander' | 'lunge' | 'recoil' | 'hit' | 'celebrate'): void {
    if (kind === 'wander') {
      for (const body of this.bodies.values()) body.goalWait = 0
      return
    }
    if (kind === 'celebrate') {
      this.cheer('red')
      this.cheer('blue')
      return
    }
    for (const body of this.bodies.values()) {
      if (body.dying > 0 || body.shown === 0) continue
      if (kind === 'lunge') {
        body.poseMode = 2
        body.posePeak = Math.max(body.posePeak, 1.16)
        body.poseClock = 0
        body.kick = 0
      } else if (kind === 'recoil') {
        body.poseMode = 3
        body.poseClock = 0
        body.poseRecoilVel = 1.4
        body.kick = 0
      } else if (kind === 'hit') {
        body.flinch = 1
        body.flinchX = body.team === 'red' ? -1 : 1
        body.flinchY = -0.25
        body.kick = 0
        body.hurt = 1
      }
    }
  }

  count(team: TeamId): number {
    let total = 0
    for (const player of this.players.values()) if (player.team === team && !player.isNpc) total += 1
    return total
  }

  counts(): { red: number; blue: number } {
    return { red: this.count('red'), blue: this.count('blue') }
  }

  leaderboard(limit: number): LeaderboardEntry[] {
    return [...this.players.values()]
      .filter((player) => !player.isNpc)
      .sort((a, b) => b.battlePoints - a.battlePoints || b.giftValue - a.giftValue || b.damageDealt - a.damageDealt)
      .slice(0, limit)
      .map((player) => ({
        id: player.id,
        username: player.username,
        avatarUrl: player.avatarUrl,
        initials: player.initials,
        team: player.team,
        giftValue: player.giftValue,
        battlePoints: player.battlePoints,
        damageDealt: player.damageDealt,
        giftCount: player.giftCount,
        largestCombo: player.largestCombo,
      }))
  }

  topId(team: TeamId): string | null {
    let best: Player | null = null
    for (const player of this.players.values()) {
      if (player.team !== team || player.battlePoints <= 0) continue
      if (!best || player.battlePoints > best.battlePoints) best = player
    }
    return best?.id ?? null
  }

  toEntry(id: string): LeaderboardEntry | null {
    const player = this.players.get(id)
    if (!player) return null
    return {
      id: player.id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      initials: player.initials,
      team: player.team,
      giftValue: player.giftValue,
      battlePoints: player.battlePoints,
      damageDealt: player.damageDealt,
      giftCount: player.giftCount,
      largestCombo: player.largestCombo,
    }
  }

  private fillVitals(body: PlayerBody): void {
    if (!(body.maxHp > 0)) body.maxHp = battleConfig.playerHealth
    if (typeof body.hp !== 'number' || Number.isNaN(body.hp)) body.hp = body.maxHp
    body.hp = Math.max(0, Math.min(body.maxHp, body.hp))
    if (typeof body.grow !== 'number') body.grow = 0
    if (typeof body.growHold !== 'number') body.growHold = 0
    if (typeof body.surge !== 'number') body.surge = 0
    if (typeof body.surgeHold !== 'number') body.surgeHold = 0
    if (typeof body.hurt !== 'number') body.hurt = 0
    if (typeof body.dying !== 'number') body.dying = 0
    if (typeof body.power !== 'number') body.power = 0
    if (typeof body.poseScale !== 'number') body.poseScale = 1
    if (typeof body.poseVel !== 'number') body.poseVel = 0
    if (typeof body.poseSquash !== 'number') body.poseSquash = 1
    if (typeof body.poseSquashVel !== 'number') body.poseSquashVel = 0
    if (typeof body.poseRecoil !== 'number') body.poseRecoil = 0
    if (typeof body.poseRecoilVel !== 'number') body.poseRecoilVel = 0
    if (typeof body.poseSpin !== 'number') body.poseSpin = 0
    if (typeof body.poseMode !== 'number') body.poseMode = 0
    if (typeof body.posePeak !== 'number') body.posePeak = 1
    if (typeof body.poseClock !== 'number') body.poseClock = 0
    if (typeof body.poseHold !== 'number') body.poseHold = 0
    if (typeof body.crown !== 'number') body.crown = 0
    if (typeof body.lift !== 'number') body.lift = 0
    if (typeof body.spin !== 'number') body.spin = 0
    if (typeof body.crack !== 'number') body.crack = 0
    if (typeof body.frost !== 'number') body.frost = 0
    if (!body.motion) body.motion = 'wander'
    if (typeof body.persona !== 'number') body.persona = -1
    if (typeof body.goalWait !== 'number') body.goalWait = 0.8
    if (typeof body.goalSerial !== 'number') body.goalSerial = 0
    if (typeof body.lean !== 'number') body.lean = 0
    if (typeof body.trail !== 'number') body.trail = 0
    if (typeof body.shown !== 'number') body.shown = 1
    if (typeof body.motionR !== 'number') body.motionR = AVATAR_BASE / 2
    if (typeof body.cheer !== 'number') body.cheer = 0
    if (typeof body.stun !== 'number') body.stun = 0
    if (typeof body.kick !== 'number') body.kick = 0
    if (typeof body.lunge !== 'number') body.lunge = 0
    if (!(body.speed >= 0)) body.speed = 0
    if (!(body.curve >= 0)) body.curve = 0
  }

  private stepPose(body: PlayerBody, dt: number): void {
    const rest = 1 + body.power
    body.poseClock += dt
    body.poseSpin += dt * (body.poseMode > 0 ? 8.5 : 1.1)
    let target = rest
    let squash = 1
    if (body.poseHold > 0) {
      body.poseHold = Math.max(0, body.poseHold - dt)
      if (body.poseMode === 0 || body.poseMode === 1) body.poseMode = 2
      target = rest * Math.min(1.25, Math.max(1.08, body.posePeak))
      squash = 0.94
      if (body.poseHold === 0) {
        body.poseMode = 2
        body.poseClock = 0
      }
    } else if (body.poseMode === 1) {
      target = rest * 0.92
      squash = 1.08
      if (body.poseClock > 0.07 || body.poseScale < rest * 0.95) {
        body.poseMode = 2
        body.poseClock = 0
      }
    } else if (body.poseMode === 2) {
      target = rest * body.posePeak
      squash = 0.9
      if (body.poseClock > 0.12 && body.poseScale > target * 0.94) {
        body.poseMode = 3
        body.poseRecoilVel = 1.4
        body.poseClock = 0
      }
    } else if (body.poseMode === 3) {
      target = rest
      squash = 1.04
      if (body.poseClock > 0.28 && Math.abs(body.poseScale - rest) < 0.03) body.poseMode = 0
    }
    if (body.posePeak > 1.4 && body.poseMode !== 0 && body.poseClock > 0.7) {
      body.poseMode = 3
      body.posePeak = 1
      target = rest
    }
    const scale = springTo(body.poseScale, body.poseVel, target, dt)
    body.poseScale = scale.value
    body.poseVel = scale.velocity
    const squashStep = springTo(body.poseSquash, body.poseSquashVel, squash, dt, 220, 14)
    body.poseSquash = squashStep.value
    body.poseSquashVel = squashStep.velocity
    const recoil = springTo(body.poseRecoil, body.poseRecoilVel, 0, dt, 90, 12)
    body.poseRecoil = recoil.value
    body.poseRecoilVel = recoil.velocity
  }

  private ensureMotion(body: PlayerBody): void {
    if (typeof body.vx !== 'number') body.vx = 0
    if (typeof body.vy !== 'number') body.vy = 0
    if (typeof body.aimX !== 'number') body.aimX = body.x
    if (typeof body.aimY !== 'number') body.aimY = body.y
    if (!(body.aimLeft > 0)) body.aimLeft = 0
    if (!(body.cruise > 0)) body.cruise = 0.07 + (hashString(body.id) % 90) / 1000
  }

  private teamBodies(team: TeamId): PlayerBody[] {
    const list: PlayerBody[] = []
    for (const body of this.bodies.values()) if (body.team === team) list.push(body)
    return list
  }

  private layout(team: TeamId): void {
    this.arrange(team)
  }

  private arrange(team: TeamId): void {
    const bounds = teamBounds(team)
    const ordered = [...this.players.values()]
      .filter((player) => player.team === team && !player.isNpc && !isNpcId(player.id))
      .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))
    const count = ordered.length
    const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 12 ? 3 : 4
    const rows = Math.max(1, Math.ceil(count / cols))
    ordered.forEach((player, index) => {
      const body = this.bodies.get(player.id)
      if (!body) return
      const col = index % cols
      const row = Math.floor(index / cols)
      const padX = 0.02
      const padY = 0.015
      const innerW = Math.max(0.04, bounds.x1 - bounds.x0 - padX * 2)
      const innerH = Math.max(0.04, bounds.y1 - bounds.y0 - padY * 2)
      const faceCol = team === 'red' ? col : cols - 1 - col
      body.homeX = bounds.x0 + padX + (cols === 1 ? innerW / 2 : ((faceCol + 0.5) * innerW) / cols)
      body.homeY = bounds.y0 + padY + (rows === 1 ? innerH * 0.46 : ((row + 0.5) * innerH) / rows)
      if (body.spawn < 0.05) {
        body.x = body.homeX
        body.y = body.homeY
        if (body.goalSerial === 0) {
          body.aimX = 0
          body.aimY = 0
        }
      }
    })
  }
}

export function gridShape(count: number): { cols: number; rows: number } {
  const total = Math.max(1, count)
  let bestCols = 1
  let bestScore = -1
  const maxCols = Math.min(total, 8)
  for (let cols = 1; cols <= maxCols; cols += 1) {
    const rows = Math.ceil(total / cols)
    const score = Math.min(0.3 / cols, 0.54 / rows)
    if (score > bestScore) {
      bestScore = score
      bestCols = cols
    }
  }
  return { cols: bestCols, rows: Math.ceil(total / bestCols) }
}

export function avatarRadius(count: number, viewWidth: number, viewHeight: number): number {
  const fitted = viewHeight > 0 ? viewHeight / DESIGN_HEIGHT : 1
  const { cols, rows } = gridShape(Math.max(1, count))
  const cell = Math.min((viewWidth * 0.34) / cols, (viewHeight * 0.28) / rows)
  return Math.min(AVATAR_BASE / 2, cell * 0.46) * fitted
}

export function freshRoster(system: PlayerSystem): void {
  for (let i = 0; i < battleConfig.rosterRed; i += 1) system.addGenerated('red', false)
  for (let i = 0; i < battleConfig.rosterBlue; i += 1) system.addGenerated('blue', false)
  for (const body of system.bodies.values()) body.nameTime = 0
  system.layoutAll()
}

function springTo(value: number, velocity: number, target: number, dt: number, stiffness = 260, damping = 16): { value: number; velocity: number } {
  const step = Math.min(0.033, Math.max(0, dt))
  let next = value
  let vel = velocity
  vel += (target - next) * stiffness * step
  vel *= Math.exp(-damping * step)
  next += vel * step
  return { value: next, velocity: vel }
}
