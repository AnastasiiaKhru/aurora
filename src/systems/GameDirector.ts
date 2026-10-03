import { battleConfig } from '../config/battleConfig.ts'
import { attackHeadlines, attackImpacts, rarityPriority } from '../config/effectConfig.ts'
import { resolveGift } from '../config/tiktokGifts.ts'
import type {
  Announcement,
  AttackCommand,
  ComboCallout,
  HudSnapshot,
  WinCondition,
} from '../types/Battle.ts'
import type { BattleFeedItem, BattleFeedTone, GiftEvent } from '../types/Events.ts'
import type { GiftRarity, ShakeLevel, TikTokGift } from '../types/Gift.ts'
import type { TeamAssignMode, TeamId } from '../types/Team.ts'
import { initialsOf } from '../utils/format.ts'
import { comboIntensity, comboScoreFactor } from '../utils/math.ts'
import { otherTeam, resolveTeam } from '../utils/team.ts'
import { AttackSystem } from './AttackSystem.ts'
import { BattleSystem } from './BattleSystem.ts'
import { ComboSystem } from './ComboSystem.ts'
import { DamageSystem } from './DamageSystem.ts'
import { GiftSystem } from './GiftSystem.ts'
import { MomentumSystem } from './MomentumSystem.ts'
import { freshRoster, PlayerSystem } from './PlayerSystem.ts'
import { SoundManager } from './SoundSystem.ts'

type MusicLevel = 'normal' | 'rush' | 'final' | 'victory'

export class GameDirector {
  readonly players = new PlayerSystem()
  readonly gifts = new GiftSystem()
  readonly attacks = new AttackSystem()
  readonly combos = new ComboSystem()
  readonly momentum = new MomentumSystem()
  readonly damage = new DamageSystem()
  readonly battle = new BattleSystem()
  readonly sound = new SoundManager()

  teamAssignMode: TeamAssignMode = battleConfig.teamAssignMode
  cinematic = 0
  teamFlash = { red: 0, blue: 0 }
  epoch = 1
  topRedId: string | null = null
  topBlueId: string | null = null
  hud: HudSnapshot

  private listeners = new Set<() => void>()
  private feed: BattleFeedItem[] = []
  private callouts: ComboCallout[] = []
  private announcement: Announcement | null = null
  private selectedId: string | null = null
  private seq = 1
  private raf = 0
  private loopToken = 0
  private last = 0
  private hudAccum = 0
  private dirty = true
  private music: MusicLevel = 'normal'

  constructor() {
    freshRoster(this.players)
    this.hud = this.makeSnapshot()
    this.startLoop()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): HudSnapshot => this.hud

  startLoop(): void {
    if (this.raf) return
    const token = ++this.loopToken
    this.last = performance.now()
    const frame = (now: number) => {
      if (token !== this.loopToken) return
      try {
        const dt = Math.min(0.05, (now - this.last) / 1000)
        this.last = now
        this.tick(dt, now)
      } catch (error) {
        console.error(error)
      }
      if (token !== this.loopToken) return
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  stopLoop(): void {
    this.loopToken += 1
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  start(): void {
    if (this.battle.status === 'paused') this.battle.status = 'running'
    this.publish()
  }

  pause(): void {
    if (this.battle.status === 'running') this.battle.status = 'paused'
    this.publish()
  }

  reset(): void {
    this.epoch += 1
    this.players.clear()
    freshRoster(this.players)
    this.gifts.clear()
    this.attacks.reset()
    this.combos.reset()
    this.momentum.reset()
    this.battle.reset()
    this.feed = []
    this.callouts = []
    this.announcement = null
    this.selectedId = null
    this.cinematic = 0
    this.teamFlash.red = 0
    this.teamFlash.blue = 0
    this.setMusic('normal')
    this.publish()
  }

  setDuration(seconds: number): void {
    const ms = Math.max(15, Math.min(30 * 60, seconds)) * 1000
    this.battle.setDuration(ms)
    this.publish()
  }

  runForever(): void {
    this.battle.runForever()
    this.setMusic('normal')
    this.publish()
  }

  stopBattle(): void {
    this.battle.stop()
    this.publish()
  }

  jumpTo(ms: number): void {
    this.battle.jumpTo(Math.max(0, ms))
    this.publish()
  }

  setWinCondition(condition: WinCondition): void {
    this.battle.winCondition = condition
    this.publish()
  }

  setTeamAssignMode(mode: TeamAssignMode): void {
    this.teamAssignMode = mode
    this.publish()
  }

  toggleMute(): void {
    this.sound.toggle()
    this.publish()
  }

  addRandom(count: number, team?: TeamId): void {
    if (team) {
      for (let i = 0; i < count; i += 1) this.players.addGenerated(team, false)
    } else {
      const half = Math.floor(count / 2)
      for (let i = 0; i < half; i += 1) this.players.addGenerated('red', false)
      for (let i = 0; i < count - half; i += 1) this.players.addGenerated('blue', false)
    }
    this.players.layoutAll()
    this.publish()
  }

  selectAt(nx: number, ny: number, width: number, height: number): void {
    const id = this.players.pick(nx, ny, width, height)
    this.selectedId = id && id === this.selectedId ? null : id
    this.publish()
  }

  clearSelection(): void {
    if (!this.selectedId) return
    this.selectedId = null
    this.publish()
  }

  handleJoin(userId: string, username: string, avatarUrl: string, preferred: TeamId): void {
    const team = resolveTeam(preferred, this.teamAssignMode, this.players.counts())
    const existing = this.players.players.get(userId)
    if (existing) {
      if (existing.team !== team) this.players.setTeam(userId, team)
    } else {
      this.players.add({
        id: userId,
        username,
        team,
        avatarUrl,
        avatarKey: '',
        initials: initialsOf(username),
      })
    }
    this.pushFeed(`@${username} joined ${team.toUpperCase()}`, team, team)
    this.publish()
  }

  handleLeave(userId: string, username: string): void {
    const player = this.players.players.get(userId)
    if (!player) return
    const team = player.team
    this.players.remove(userId)
    if (this.selectedId === userId) this.selectedId = null
    this.pushFeed(`@${username} left ${team.toUpperCase()}`, team, 'neutral')
    this.publish()
  }

  handleGift(event: GiftEvent): void {
    if (this.battle.status !== 'running') return
    this.gifts.push(event)
    this.dirty = true
  }

  handleLike(team: TeamId, count: number): void {
    if (this.battle.status !== 'running') return
    const side = this.battle.team(resolveTeam(team, this.teamAssignMode, this.players.counts()))
    const amount = Math.max(1, count)
    side.likesTotal += amount
    side.likeBank += amount
    side.score += amount * battleConfig.likeScoreEach
    const thresholds = [...battleConfig.likeThresholds].sort((a, b) => b.likes - a.likes)
    for (const threshold of thresholds) {
      if (side.likeBank < threshold.likes) continue
      side.likeBank -= threshold.likes
      side.score += threshold.score
      this.spawnPulse(side.id, threshold.intensity, threshold.damage, `${threshold.likes.toLocaleString('en-US')} likes`)
      this.pushFeed(`${side.name} surged · ${threshold.likes.toLocaleString('en-US')} likes`, side.id, side.id)
      this.sound.play('whoosh', threshold.intensity)
      break
    }
    this.publish()
  }

  handleFollow(username: string, team: TeamId): void {
    if (this.battle.status !== 'running') return
    const side = this.battle.team(resolveTeam(team, this.teamAssignMode, this.players.counts()))
    side.score += battleConfig.followScore
    this.spawnPulse(side.id, 0.28, 0, 'follow')
    this.pushFeed(`@${username} followed`, side.id, side.id)
    this.publish()
  }

  handleShare(username: string, team: TeamId): void {
    if (this.battle.status !== 'running') return
    const side = this.battle.team(resolveTeam(team, this.teamAssignMode, this.players.counts()))
    side.score += battleConfig.shareScore
    this.spawnPulse(side.id, 0.36, 0, 'share')
    this.pushFeed(`@${username} shared the battle`, side.id, side.id)
    this.publish()
  }

  onImpact(command: AttackCommand, x: number, y: number, tickIndex: number): number {
    if (this.battle.status !== 'running' && this.battle.status !== 'finishing') return 0
    if (command.damage <= 0) {
      if (tickIndex === 0) this.sound.play(command.sound, 0.35)
      return 0
    }
    const portion = command.damage / Math.max(1, command.impacts.length)
    const { dealt, target } = this.damage.apply(command.team, portion, this.battle.red, this.battle.blue)
    this.players.flinch(target, x, y, Math.min(1.15, 0.3 + command.intensity * 0.4))
    this.teamFlash[target] = Math.min(1, this.teamFlash[target] + 0.22 + command.intensity * 0.18)
    if (tickIndex === 0) {
      this.sound.play(command.sound, Math.min(1, 0.4 + command.intensity * 0.4))
      if (command.rarity === 'legendary') this.cinematic = Math.max(this.cinematic, 0.52)
    }
    if (this.battle.checkWipe()) this.dirty = true
    this.dirty = true
    return dealt
  }

  private tick(dt: number, now: number): void {
    this.players.update(dt, now / 1000)
    this.momentum.tick(dt, now, this.battle.red, this.battle.blue)
    this.combos.decay(now)
    this.attacks.release(now)
    if (this.attacks.winding) this.cinematic = Math.max(this.cinematic, 0.62)
    else this.cinematic = Math.max(0, this.cinematic - dt * 0.5)
    this.teamFlash.red = Math.max(0, this.teamFlash.red - dt * 1.25)
    this.teamFlash.blue = Math.max(0, this.teamFlash.blue - dt * 1.25)

    if (this.callouts.some((callout) => callout.life <= dt)) this.dirty = true
    for (const callout of this.callouts) callout.life -= dt
    this.callouts = this.callouts.filter((callout) => callout.life > 0)
    if (this.announcement) {
      this.announcement.life -= dt
      if (this.announcement.life <= 0) {
        this.announcement = null
        this.dirty = true
      }
    }

    if (this.battle.status === 'running') {
      for (const item of this.gifts.flush(now)) this.resolveGift(item.event, item.count, now)
    }

    const signals = this.battle.tick(dt, () => this.players.leaderboard(8))
    if (signals.enteredRush) {
      this.setMusic('rush')
      this.sound.play('whoosh', 0.85)
      this.pushFeed('FINAL RUSH', undefined, 'gold')
    }
    if (this.battle.phase === 'final_10') this.setMusic('final')
    else if (this.battle.phase === 'final_rush') this.setMusic('rush')
    else if (this.battle.status === 'running') this.setMusic('normal')
    if (signals.finalSecond != null) this.sound.play('countdown', (11 - signals.finalSecond) / 10)
    if (signals.justFinished) {
      this.setMusic('victory')
      this.sound.play('victory')
    }

    this.hudAccum += dt
    if (this.dirty || signals.changed || this.hudAccum > 0.1) {
      this.publish()
      this.dirty = false
      this.hudAccum = 0
    }
  }

  private resolveGift(event: GiftEvent, count: number, now: number): void {
    const team = this.prepareSender(event)
    const gift = resolveGift(event.giftId, event.giftName, event.coinValue)
    const combo = this.combos.register(event.userId, gift.id, count, gift.comboEligible, now)
    const damage = scaledDamage(gift.baseDamage, count, combo.total)
    const score = Math.max(1, Math.round(gift.scoreValue * count * comboScoreFactor(combo.total)))
    const intensity = gift.animationIntensity * comboIntensity(combo.total)
    const player = this.players.players.get(event.userId)
    if (player) {
      const coins = event.coinValue ?? gift.coinValue
      player.giftValue += coins * count
      player.giftCount += count
      player.battlePoints += score
      player.damageDealt += damage
      player.largestCombo = Math.max(player.largestCombo, combo.total)
      this.players.pulse(event.userId)
    }
    this.battle.team(team).score += score
    this.pushFeed(describeGift(event.username, gift, count), team, team)

    if (combo.milestone && combo.milestone >= 2) {
      this.callouts.unshift({
        id: `c${this.seq++}`,
        username: event.username,
        team,
        count: combo.milestone,
        giftName: gift.displayName,
        icon: gift.icon,
        life: 2.5,
      })
      this.callouts = this.callouts.slice(0, 3)
      this.sound.play('combo', Math.min(1, combo.milestone / 45))
      this.pushFeed(`@${event.username} hit ${combo.milestone}× ${gift.displayName}`, team, 'gold')
    }

    const rush = this.momentum.registerGift(team, event.userId, (event.coinValue ?? gift.coinValue) * count, now, this.battle.team(team))
    if (rush) this.pushFeed(rush.label, rush.team, rush.team)

    if (gift.rarity === 'large' || gift.rarity === 'legendary') {
      const headline = attackHeadlines[gift.attackType]
      this.announcement = {
        id: `a${this.seq++}`,
        username: event.username,
        avatarUrl: player?.avatarUrl ?? '',
        team,
        title: gift.rarity === 'legendary' ? `UNLEASHED ${headline}` : headline,
        subtitle: count > 1 ? `${gift.displayName} ×${count}` : gift.displayName,
        icon: gift.icon,
        image: gift.image,
        rarity: gift.rarity,
        life: gift.rarity === 'legendary' ? 3.5 : 2.25,
      }
      if (gift.rarity === 'legendary') {
        this.cinematic = 0.7
        this.sound.play('whoosh', 0.7)
      }
    }

    const burst = burstCount(gift.rarity, count)
    const body = this.players.bodies.get(event.userId)
    const from = body ?? (team === 'red' ? { x: 0.28, y: 0.5 } : { x: 0.72, y: 0.5 })
    for (let i = 0; i < burst; i += 1) {
      const point = this.players.impactPoint(otherTeam(team))
      const spread = burst > 1 ? 0.035 : 0
      const windup = gift.rarity === 'legendary' ? battleConfig.legendaryWindupMs : 0
      this.attacks.enqueue(
        {
          attackType: gift.attackType,
          team,
          fromX: from.x,
          fromY: from.y,
          toX: point.x + (Math.random() - 0.5) * spread,
          toY: point.y + (Math.random() - 0.5) * spread,
          intensity,
          duration: Math.max(0.35, gift.duration / 1000),
          damage: damage / burst,
          shake: shakeFor(gift, combo.total),
          particleIntensity: gift.particleIntensity * comboIntensity(combo.total),
          sound: gift.soundEffect,
          priority: rarityPriority[gift.rarity],
          username: event.username,
          giftName: gift.displayName,
          combo: combo.total,
          rarity: gift.rarity,
          impacts: attackImpacts[gift.attackType],
        },
        windup + i * 110,
      )
    }
    this.dirty = true
  }

  private prepareSender(event: GiftEvent): TeamId {
    const existing = this.players.players.get(event.userId)
    if (existing) return existing.team
    const team = resolveTeam(event.team, this.teamAssignMode, this.players.counts())
    this.players.add({
      id: event.userId,
      username: event.username,
      team,
      avatarUrl: event.avatarUrl,
      avatarKey: '',
      initials: initialsOf(event.username),
    })
    this.pushFeed(`@${event.username} joined ${team.toUpperCase()}`, team, team)
    return team
  }

  private spawnPulse(team: TeamId, intensity: number, damage: number, label: string): void {
    const origin = team === 'red' ? { x: 0.24, y: 0.48 } : { x: 0.76, y: 0.48 }
    const point = this.players.impactPoint(otherTeam(team))
    this.attacks.enqueue({
      attackType: 'pulse',
      team,
      fromX: origin.x,
      fromY: origin.y,
      toX: point.x,
      toY: point.y,
      intensity,
      duration: 0.95,
      damage,
      shake: intensity > 0.95 ? 'small' : 'none',
      particleIntensity: intensity,
      sound: 'whoosh',
      priority: 2,
      username: team.toUpperCase(),
      giftName: label,
      combo: 1,
      rarity: intensity > 0.9 ? 'medium' : 'small',
      impacts: attackImpacts.pulse,
    })
  }

  private pushFeed(text: string, team: TeamId | undefined, tone: BattleFeedTone): void {
    this.feed.unshift({ id: `f${this.seq++}`, text, team, tone })
    this.feed = this.feed.slice(0, battleConfig.maxFeed)
  }

  private setMusic(level: MusicLevel): void {
    if (this.music === level) return
    this.music = level
    this.sound.setIntensity(level)
  }

  private publish(): void {
    this.topRedId = this.players.topId('red')
    this.topBlueId = this.players.topId('blue')
    this.hud = this.makeSnapshot()
    for (const listener of this.listeners) listener()
  }

  private makeSnapshot(): HudSnapshot {
    const counts = this.players.counts()
    this.battle.red.playerCount = counts.red
    this.battle.blue.playerCount = counts.blue
    return {
      status: this.battle.status,
      phase: this.battle.phase,
      endless: this.battle.endless,
      elapsedMs: this.battle.elapsedMs,
      timeLeftMs: this.battle.timeLeftMs,
      durationMs: this.battle.durationMs,
      red: { ...this.battle.red },
      blue: { ...this.battle.blue },
      feed: this.feed.slice(0, battleConfig.maxFeed),
      combos: this.callouts.slice(0, 3),
      announcement: this.announcement ? { ...this.announcement } : null,
      rush: this.momentum.rush ? { ...this.momentum.rush } : null,
      leaderboard: this.players.leaderboard(5),
      victory: this.battle.victory,
      muted: this.sound.muted,
      selected: this.selectedId ? this.players.toEntry(this.selectedId) : null,
      winCondition: this.battle.winCondition,
      teamAssignMode: this.teamAssignMode,
      finalTen: this.battle.finalTen,
      epoch: this.epoch,
    }
  }
}

function scaledDamage(base: number, count: number, combo: number): number {
  const stack = count <= 1 ? 1 : 1 + Math.log2(count) * 0.9
  const comboMul = 1 + (comboIntensity(combo) - 1) * 0.55
  return Math.max(1, Math.round(base * stack * comboMul))
}

function burstCount(rarity: GiftRarity, count: number): number {
  if (rarity !== 'micro' && rarity !== 'small') return 1
  if (count >= 8) return 1
  if (count >= 4) return 3
  if (count >= 2) return 2
  return 1
}

function shakeFor(gift: TikTokGift, combo: number): ShakeLevel {
  if (combo >= 100 && (gift.screenShake === 'none' || gift.screenShake === 'small')) return 'medium'
  if (combo >= 50 && gift.screenShake === 'none') return 'small'
  return gift.screenShake
}

function describeGift(username: string, gift: TikTokGift, count: number): string {
  const headline = attackHeadlines[gift.attackType]
  if (gift.rarity === 'legendary') return `@${username} triggered ${headline}`
  if (gift.attackType === 'rocket' || gift.attackType === 'missile' || gift.attackType === 'airstrike') {
    return `@${username} launched ${gift.displayName}`
  }
  if (count > 1) return `@${username} sent ${gift.displayName} ×${count}`
  return `@${username} sent ${gift.displayName}`
}

export const director = new GameDirector()
