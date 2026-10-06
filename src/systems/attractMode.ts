import type { TeamId } from '../types/Team.ts'

export const NPC_ATTACK_DAMAGE = 0.1
export const NPC_MAX_TOTAL_DAMAGE_PER_ROUND = 5

export const attractModePlayers = {
  canada: {
    id: 'npc-canada',
    displayName: 'Maple Guardian',
    team: 'canada',
    isNpc: true,
  },
  usa: {
    id: 'npc-usa',
    displayName: 'Star Guardian',
    team: 'usa',
    isNpc: true,
  },
} as const

export const attractModeConfig = {
  enabled: true,
  activateBelowRealPlayers: 2,
  resumeAfterIdleMs: 20_000,
  minimumAttackDelayMs: 4_000,
  maximumAttackDelayMs: 8_000,
  damagePerAttack: NPC_ATTACK_DAMAGE,
  maximumDamagePerRound: NPC_MAX_TOTAL_DAMAGE_PER_ROUND,
  minimumTeamHealth: 10,
  showNpcBadge: false,
  visualIntensity: 0.7,
  damageEnabled: true,
  override: 'auto' as 'auto' | 'start' | 'stop',
}

export type NpcKind = 'maple' | 'star'
export type AttractMode = 'full' | 'reduced' | 'paused' | 'waiting' | 'hidden'

export function isNpcId(id: string): boolean {
  return id === attractModePlayers.canada.id || id === attractModePlayers.usa.id
}

export function isGeneratedId(id: string): boolean {
  return /^p\d+$/.test(id)
}

export function realTeamCounts(players: Iterable<{ id: string; team: TeamId; isNpc?: boolean }>, living: (id: string) => boolean): { red: number; blue: number } {
  const counts = { red: 0, blue: 0 }
  for (const player of players) {
    if (player.isNpc || isNpcId(player.id) || isGeneratedId(player.id)) continue
    if (!living(player.id)) continue
    counts[player.team] += 1
  }
  return counts
}

export function chooseNpcSide(random: () => number, last: TeamId | null): TeamId {
  if (!last) return random() < 0.5 ? 'red' : 'blue'
  if (random() < 0.38) return last
  return last === 'red' ? 'blue' : 'red'
}

export function nextNpcDelay(random: () => number, mode: 'full' | 'reduced'): number {
  const stretch = mode === 'reduced' ? 2.4 : 1
  const long = random() < 0.22
  const min = long ? 10_000 : attractModeConfig.minimumAttackDelayMs
  const max = long ? 12_000 : attractModeConfig.maximumAttackDelayMs
  const span = Math.max(0, max - min)
  return (min + random() * span) * stretch
}

export function allowedNpcDamage(
  requested: number,
  dealtThisRound: number,
  targetHealth: number,
  maxHealth: number,
): number {
  if (!attractModeConfig.damageEnabled) return 0
  const room = Math.max(0, attractModeConfig.maximumDamagePerRound - dealtThisRound)
  const floor = maxHealth * (attractModeConfig.minimumTeamHealth / 100)
  const aboveFloor = Math.max(0, targetHealth - floor)
  return Math.max(0, Math.min(requested, room, aboveFloor))
}

export function applyNpcHealth(
  target: { health: number; maxHealth: number; score: number },
  budget: { dealt: number },
  requested: number,
): number {
  const dealt = allowedNpcDamage(requested, budget.dealt, target.health, target.maxHealth)
  target.health = Math.max(0, target.health - dealt)
  budget.dealt += dealt
  return dealt
}

export class AttractClock {
  nextAt = 0
  lastTeam: TeamId | null = null
  damageDealt = 0
  idleSince = 0
  holding = false
  fade = 1
  mode: AttractMode = 'full'

  reset(): void {
    this.nextAt = 0
    this.lastTeam = null
    this.damageDealt = 0
    this.idleSince = 0
    this.holding = false
    this.fade = 1
    this.mode = attractModeConfig.enabled ? 'full' : 'hidden'
  }

  step(nowMs: number, counts: { red: number; blue: number }, random: () => number = Math.random): TeamId | null {
    const total = counts.red + counts.blue
    const crowded = counts.red >= 2 && counts.blue >= 2
    let mode: AttractMode = 'full'
    if (!attractModeConfig.enabled || attractModeConfig.override === 'stop') mode = 'hidden'
    else if (attractModeConfig.override === 'start') mode = 'full'
    else if (crowded) mode = 'paused'
    else if (total >= attractModeConfig.activateBelowRealPlayers || total > 0) mode = 'reduced'
    else if (this.holding) mode = 'waiting'
    else mode = 'full'

    if (mode === 'paused' || mode === 'reduced') {
      this.holding = true
      this.idleSince = 0
    }
    if (mode === 'waiting') {
      if (this.idleSince === 0) this.idleSince = nowMs
      if (nowMs - this.idleSince >= attractModeConfig.resumeAfterIdleMs) {
        this.holding = false
        this.idleSince = 0
        mode = 'full'
      }
    }
    if (mode === 'full') this.holding = false

    this.mode = mode
    let fire: TeamId | null = null
    if (mode === 'full' || mode === 'reduced') {
      if (this.nextAt === 0) this.nextAt = nowMs + nextNpcDelay(random, mode)
      if (nowMs >= this.nextAt) {
        fire = chooseNpcSide(random, this.lastTeam)
        this.lastTeam = fire
        this.nextAt = nowMs + nextNpcDelay(random, mode)
      }
    } else {
      this.nextAt = 0
    }
    return fire
  }

  ease(dt: number, posing: boolean): void {
    const target = this.mode === 'hidden' ? 0 : this.mode === 'paused' || this.mode === 'waiting' ? 0.34 : 1
    const rate = posing ? 0.35 : 1.5
    this.fade += (target - this.fade) * Math.min(1, dt * rate)
  }
}
