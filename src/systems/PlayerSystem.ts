import { battleConfig } from '../config/battleConfig.ts'
import type { LeaderboardEntry, Player } from '../types/Player.ts'
import type { TeamId } from '../types/Team.ts'
import { makeAvatar } from '../utils/avatar.ts'
import { initialsOf } from '../utils/format.ts'
import { clamp, hashString } from '../utils/math.ts'
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
  nameTime: number
}

interface Bounds {
  x0: number
  x1: number
  y0: number
  y1: number
}

const BOUNDS: Record<TeamId, Bounds> = {
  red: { x0: 0.08, x1: 0.38, y0: 0.2, y1: 0.74 },
  blue: { x0: 0.62, x1: 0.92, y0: 0.2, y1: 0.74 },
}

export class PlayerSystem {
  readonly players = new Map<string, Player>()
  readonly bodies = new Map<string, PlayerBody>()
  private seq = 1

  clear(): void {
    this.players.clear()
    this.bodies.clear()
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
      if (existing.team !== input.team) this.setTeam(input.id, input.team)
      return existing
    }
    const seed = hashString(input.id + input.username)
    const hue = input.team === 'red' ? (348 + (seed % 28)) % 360 : 204 + (seed % 28)
    const art = input.avatarUrl
      ? { key: input.avatarKey || `remote:${input.avatarUrl}`, url: input.avatarUrl }
      : makeAvatar(input.initials, hue, seed)
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
      nameTime: 2.4,
    }
    this.players.set(player.id, player)
    this.bodies.set(player.id, body)
    if (relayout) this.layout(player.team)
    return player
  }

  remove(id: string): void {
    const player = this.players.get(id)
    if (!player) return
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
    body.spawn = 0
    body.nameTime = 2
    this.layout(previous)
    this.layout(team)
  }

  layoutAll(): void {
    this.layout('red')
    this.layout('blue')
  }

  update(dt: number, time: number): void {
    for (const body of this.bodies.values()) {
      body.spawn = Math.min(1, body.spawn + dt * 1.7)
      body.flinch = Math.max(0, body.flinch - dt * 2.2)
      body.attack = Math.max(0, body.attack - dt * 1.5)
      body.nameTime = Math.max(0, body.nameTime - dt)
      const floatX = Math.sin(time * 0.85 + body.phase) * 0.007
      const floatY = Math.cos(time * 1.05 + body.phase * 1.3) * 0.011
      body.x = body.homeX + floatX + body.flinchX * body.flinch * 0.028
      body.y = body.homeY + floatY + body.flinchY * body.flinch * 0.028
    }
  }

  pulse(id: string): void {
    const body = this.bodies.get(id)
    if (!body) return
    body.attack = 1
    body.nameTime = Math.max(body.nameTime, 1.7)
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
      body.flinchX = dist > 0.001 ? dx / dist : 0
      body.flinchY = dist > 0.001 ? dy / dist : -1
    }
  }

  impactPoint(team: TeamId): { x: number; y: number } {
    const bodies = this.teamBodies(team)
    if (bodies.length > 0 && Math.random() < 0.78) {
      const body = bodies[Math.floor(Math.random() * bodies.length)]!
      return { x: body.homeX, y: body.homeY }
    }
    const bounds = BOUNDS[team]
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

  count(team: TeamId): number {
    let total = 0
    for (const player of this.players.values()) if (player.team === team) total += 1
    return total
  }

  counts(): { red: number; blue: number } {
    return { red: this.count('red'), blue: this.count('blue') }
  }

  leaderboard(limit: number): LeaderboardEntry[] {
    return [...this.players.values()]
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

  private teamBodies(team: TeamId): PlayerBody[] {
    const list: PlayerBody[] = []
    for (const body of this.bodies.values()) if (body.team === team) list.push(body)
    return list
  }

  private layout(team: TeamId): void {
    const bodies = this.teamBodies(team)
    const count = bodies.length
    if (count === 0) return
    const bounds = BOUNDS[team]
    const { cols } = gridShape(count)
    const spanX = bounds.x1 - bounds.x0
    const spanY = bounds.y1 - bounds.y0
    const cellW = spanX / cols
    const rows = Math.ceil(count / cols)
    const cellH = spanY / rows
    bodies.forEach((body, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const stagger = (row % 2) * cellW * 0.18
      const jitterX = ((hashString(body.id) % 100) / 100 - 0.5) * cellW * 0.06
      const jitterY = ((hashString(`${body.id}y`) % 100) / 100 - 0.5) * cellH * 0.06
      body.homeX = clamp(bounds.x0 + (col + 0.5) * cellW + stagger * 0.35 + jitterX, bounds.x0, bounds.x1)
      body.homeY = clamp(bounds.y0 + (row + 0.5) * cellH + jitterY, bounds.y0, bounds.y1)
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
  const { cols, rows } = gridShape(Math.max(1, count))
  const cellW = (viewWidth * 0.3) / cols
  const cellH = (viewHeight * 0.54) / rows
  return clamp(Math.min(cellW, cellH) * 0.42, 9, viewHeight * 0.04)
}

export function freshRoster(system: PlayerSystem): void {
  for (let i = 0; i < battleConfig.initialPlayersPerTeam; i += 1) system.addGenerated('red', false)
  for (let i = 0; i < battleConfig.initialPlayersPerTeam; i += 1) system.addGenerated('blue', false)
  for (const body of system.bodies.values()) body.nameTime = 0
  system.layoutAll()
}
