import { attackImpacts } from '../config/effectConfig.ts'
import { tiktokGifts } from '../config/tiktokGifts.ts'
import { styleOf, styles, type AttackStyle } from '../game/attacks/style.ts'
import type { AttackType, GiftRarity, ShakeLevel, SoundEffectId } from '../types/Gift.ts'
import type { TeamId } from '../types/Team.ts'
import { isGeneratedId, isNpcId } from './attractMode.ts'

/**
 * Team health is 120,000. A 0.05 multiplier on a Galaxy shot (7,200) would
 * deal 360 HP and start playing the match. These values keep several minutes
 * of ambient fire under a few HP, while real gifts keep their full base damage.
 */
export const AUTO_BASIC_DAMAGE = 0.1
export const AUTO_BIG_ATTACK_DAMAGE_MULTIPLIER = 0.00015

export const AUTO_BATTLE_CONFIG = {
  enabled: true,
  basicIntervalMs: 5_000,
  teamOffsetMs: 2_500,
  basicJitterMs: 400,
  bigAttackMinDelayMs: 20_000,
  bigAttackMaxDelayMs: 45_000,
  basicDamage: AUTO_BASIC_DAMAGE,
  bigDamageMultiplier: AUTO_BIG_ATTACK_DAMAGE_MULTIPLIER,
  bigDamageCap: 1.5,
  basicScale: 1.12,
  bigScale: 1.22,
  bigChargeMs: 780,
  postBigResumeMs: 1_000,
  viewerSafeDelayMs: 1_100,
  retryDelayMs: 4_000,
  basicWindupMs: 120,
  viewerHoldMs: {
    like: 700,
    comment: 800,
    follow: 1_400,
    share: 1_600,
    gift: 1_200,
    giftMedium: 1_800,
    giftLarge: 2_400,
    giftLegendary: 3_200,
  },
  debug: false,
}

/** Existing gift ids whose attack styles are visually distinct. */
export const BIG_AUTO_ATTACK_IDS = ['blaze', 'thunder', 'whirlwind', 'galaxy', 'prism', 'sunglasses', 'money_gun'] as const

export type AutoViewerKind = 'like' | 'comment' | 'follow' | 'share' | 'gift'

export interface BigAutoSpec {
  id: string
  attackType: AttackType
  giftName: string
  rarity: GiftRarity
  intensity: number
  particleIntensity: number
  sound: SoundEffectId
  shake: ShakeLevel
  impacts: number[]
  duration: number
  baseDamage: number
  style: AttackStyle
}

export type AutoAction =
  | { type: 'basic'; team: TeamId; actorId: string }
  | { type: 'charge'; team: TeamId; actorId: string; attackId: string }
  | { type: 'launch'; team: TeamId; actorId: string; attackId: string }
  | { type: 'cancel'; actorId: string }

export interface AutoBattleQuery {
  running: boolean
  round: number
  busy: boolean
  alive: (team: TeamId) => string[]
  random?: () => number
}

interface Charge {
  team: TeamId
  actorId: string
  attackId: string
  launchAt: number
}

export function isFieldDummy(player: { id: string; isNpc?: boolean }): boolean {
  if (player.isNpc || isNpcId(player.id)) return false
  return isGeneratedId(player.id)
}

export function autoLog(message: string): void {
  if (!AUTO_BATTLE_CONFIG.debug) return
  console.info(message)
}

export function basicJitter(random: () => number): number {
  return (random() * 2 - 1) * AUTO_BATTLE_CONFIG.basicJitterMs
}

export function nextBigDelay(random: () => number): number {
  const min = AUTO_BATTLE_CONFIG.bigAttackMinDelayMs
  const max = Math.max(min, AUTO_BATTLE_CONFIG.bigAttackMaxDelayMs)
  return min + random() * (max - min)
}

export function ambientAttackDamage(baseDamage: number, kind: 'basic' | 'big'): number {
  if (kind === 'basic') return AUTO_BATTLE_CONFIG.basicDamage
  const scaled = Math.max(0, baseDamage) * AUTO_BATTLE_CONFIG.bigDamageMultiplier
  return Math.min(AUTO_BATTLE_CONFIG.bigDamageCap, scaled)
}

export function viewerHoldMs(kind: AutoViewerKind, rarity?: GiftRarity): number {
  const holds = AUTO_BATTLE_CONFIG.viewerHoldMs
  if (kind === 'like') return holds.like
  if (kind === 'comment') return holds.comment
  if (kind === 'follow') return holds.follow
  if (kind === 'share') return holds.share
  if (rarity === 'legendary') return holds.giftLegendary
  if (rarity === 'large') return holds.giftLarge
  if (rarity === 'medium') return holds.giftMedium
  return holds.gift
}

export function bigAutoAttackPool(): BigAutoSpec[] {
  const pool: BigAutoSpec[] = []
  for (const id of BIG_AUTO_ATTACK_IDS) {
    const gift = tiktokGifts.find((item) => item.id === id)
    if (!gift) continue
    const style = styleOf({ giftName: gift.displayName, attackType: gift.attackType, rarity: gift.rarity })
    const designed = styles[style].duration
    pool.push({
      id: gift.id,
      attackType: gift.attackType,
      giftName: gift.displayName,
      rarity: gift.rarity,
      intensity: gift.animationIntensity,
      particleIntensity: Math.min(1.15, gift.particleIntensity),
      sound: gift.soundEffect,
      shake: 'small',
      impacts: attackImpacts[gift.attackType],
      duration: Math.min(1.65, Math.max(1.05, designed * 0.62)),
      baseDamage: gift.baseDamage,
      style,
    })
  }
  return pool
}

export function bigAutoAttackById(id: string): BigAutoSpec | null {
  return bigAutoAttackPool().find((item) => item.id === id) ?? null
}

export function pickBigAttack(random: () => number, lastId: string | null): BigAutoSpec | null {
  const pool = bigAutoAttackPool()
  if (pool.length === 0) return null
  const options = lastId ? pool.filter((item) => item.id !== lastId) : pool
  const source = options.length > 0 ? options : pool
  const index = Math.min(source.length - 1, Math.floor(random() * source.length))
  return source[index] ?? null
}

export class AutoBattleClock {
  canadaAutoAttacker: string | null = null
  usaAutoAttacker: string | null = null
  lastAutoBigAttackId: string | null = null
  nextBigTeam: TeamId = 'red'

  private armed = false
  private armedRound = -1
  private canadaNext = 0
  private usaNext = 0
  private bigNext = 0
  private phase: 'idle' | 'charging' | 'playing' = 'idle'
  private charge: Charge | null = null
  private playUntil = 0
  private basicsQuietUntil = 0
  private basicsHeld = false
  private holdBegan = 0
  private viewerUntil = 0
  private deferBig = false

  stop(): void {
    this.armed = false
    this.phase = 'idle'
    this.charge = null
    this.basicsHeld = false
    this.deferBig = false
    this.viewerUntil = 0
    this.playUntil = 0
    this.basicsQuietUntil = 0
    this.canadaAutoAttacker = null
    this.usaAutoAttacker = null
  }

  noteViewer(now: number, kind: AutoViewerKind, rarity?: GiftRarity): void {
    this.viewerUntil = Math.max(this.viewerUntil, now + viewerHoldMs(kind, rarity))
  }

  step(now: number, query: AutoBattleQuery): AutoAction[] {
    if (!AUTO_BATTLE_CONFIG.enabled || !query.running) {
      const actions: AutoAction[] = []
      if (this.charge) actions.push({ type: 'cancel', actorId: this.charge.actorId })
      this.stop()
      return actions
    }
    const random = query.random ?? Math.random
    const actions: AutoAction[] = []
    if (!this.armed || this.armedRound !== query.round) {
      if (this.charge) actions.push({ type: 'cancel', actorId: this.charge.actorId })
      this.arm(now, query.round, random)
    }
    actions.push(...this.advance(now, query, random))
    return actions
  }

  private arm(now: number, round: number, random: () => number): void {
    this.armed = true
    this.armedRound = round
    this.phase = 'idle'
    this.charge = null
    this.basicsHeld = false
    this.deferBig = false
    this.viewerUntil = 0
    this.playUntil = 0
    this.basicsQuietUntil = 0
    this.lastAutoBigAttackId = null
    this.canadaAutoAttacker = null
    this.usaAutoAttacker = null
    this.canadaNext = now + Math.max(0, basicJitter(random))
    this.usaNext = now + AUTO_BATTLE_CONFIG.teamOffsetMs + basicJitter(random)
    this.bigNext = now + nextBigDelay(random)
    this.nextBigTeam = random() < 0.5 ? 'red' : 'blue'
  }

  private advance(now: number, query: AutoBattleQuery, random: () => number): AutoAction[] {
    const actions: AutoAction[] = []
    const busy = query.busy || now < this.viewerUntil
    const imminent = this.phase === 'charging' || now >= this.bigNext - 1_000

    if (busy && imminent) {
      this.deferBig = true
      if (this.phase === 'charging' && this.charge) {
        actions.push({ type: 'cancel', actorId: this.charge.actorId })
        this.charge = null
        this.phase = 'idle'
      }
    } else if (!busy && this.deferBig) {
      this.deferBig = false
      this.bigNext = now + AUTO_BATTLE_CONFIG.viewerSafeDelayMs
    }

    if (this.phase === 'playing' && now >= this.playUntil) {
      this.phase = 'idle'
      this.bigNext = now + nextBigDelay(random)
    }

    if (this.phase === 'charging' && this.charge && now >= this.charge.launchAt) {
      const team = this.charge.team
      const alive = query.alive(team)
      const actor = alive.includes(this.charge.actorId)
        ? this.charge.actorId
        : alive[Math.floor(random() * alive.length)] ?? ''
      if (!actor) {
        actions.push({ type: 'cancel', actorId: this.charge.actorId })
        this.charge = null
        this.phase = 'idle'
        this.bigNext = now + AUTO_BATTLE_CONFIG.retryDelayMs
      } else {
        const attackId = this.charge.attackId
        const spec = bigAutoAttackById(attackId)
        const durationMs = (spec?.duration ?? 1.2) * 1000 + 400
        actions.push({ type: 'launch', team, actorId: actor, attackId })
        this.lastAutoBigAttackId = attackId
        this.charge = null
        this.phase = 'playing'
        this.playUntil = now + durationMs
        this.basicsQuietUntil = this.playUntil + AUTO_BATTLE_CONFIG.postBigResumeMs
        this.nextBigTeam = team === 'red' ? 'blue' : 'red'
      }
    }

    if (this.phase === 'idle' && !busy && now >= this.bigNext) {
      const team = this.nextBigTeam
      const alive = query.alive(team)
      const spec = pickBigAttack(random, this.lastAutoBigAttackId)
      if (alive.length === 0 || !spec) {
        this.bigNext = now + AUTO_BATTLE_CONFIG.retryDelayMs
      } else {
        const actorId = alive[Math.floor(random() * alive.length)] ?? alive[0]!
        this.phase = 'charging'
        this.charge = {
          team,
          actorId,
          attackId: spec.id,
          launchAt: now + AUTO_BATTLE_CONFIG.bigChargeMs,
        }
        actions.push({ type: 'charge', team, actorId, attackId: spec.id })
      }
    }

    const suppress = this.phase !== 'idle' || now < this.basicsQuietUntil
    if (suppress) {
      if (!this.basicsHeld) {
        this.basicsHeld = true
        this.holdBegan = now
      }
    } else if (this.basicsHeld) {
      const extra = Math.max(0, now - this.holdBegan)
      this.canadaNext += extra
      this.usaNext += extra
      this.basicsHeld = false
    }

    if (!suppress) {
      if (now >= this.canadaNext) {
        const actorId = this.attacker('red', query.alive('red'), random)
        if (actorId) actions.push({ type: 'basic', team: 'red', actorId })
        this.canadaNext = now + AUTO_BATTLE_CONFIG.basicIntervalMs + basicJitter(random)
      }
      if (now >= this.usaNext) {
        const actorId = this.attacker('blue', query.alive('blue'), random)
        if (actorId) actions.push({ type: 'basic', team: 'blue', actorId })
        this.usaNext = now + AUTO_BATTLE_CONFIG.basicIntervalMs + basicJitter(random)
      }
    }

    return actions
  }

  private attacker(team: TeamId, alive: string[], random: () => number): string | null {
    const current = team === 'red' ? this.canadaAutoAttacker : this.usaAutoAttacker
    if (current && alive.includes(current)) return current
    if (alive.length === 0) {
      if (team === 'red') this.canadaAutoAttacker = null
      else this.usaAutoAttacker = null
      return null
    }
    const pick = alive[Math.floor(random() * alive.length)] ?? alive[0]!
    if (team === 'red') this.canadaAutoAttacker = pick
    else this.usaAutoAttacker = pick
    return pick
  }
}
