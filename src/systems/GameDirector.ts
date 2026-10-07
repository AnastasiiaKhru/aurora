import { battleConfig } from '../config/battleConfig.ts'
import { attackHeadlines, attackImpacts, rarityPriority } from '../config/effectConfig.ts'
import { resolveGift } from '../config/tiktokGifts.ts'
import type {
  Announcement,
  AttackCommand,
  PowerFlash,
  ComboCallout,
  HudSnapshot,
  VictoryPortrait,
  VictoryResult,
  WinCondition,
} from '../types/Battle.ts'
import type { BattleFeedItem, BattleFeedTone, GiftEvent } from '../types/Events.ts'
import type { AttackType, GiftRarity, ShakeLevel, TikTokGift } from '../types/Gift.ts'
import type { Player } from '../types/Player.ts'
import type { TeamAssignMode, TeamId } from '../types/Team.ts'
import { initialsOf } from '../utils/format.ts'
import { comboIntensity, comboScoreFactor } from '../utils/math.ts'
import { otherTeam } from '../utils/team.ts'
import { acceptEvent, acceptSocial, decideJoin, likeShotPlan } from '../preflight/rules.ts'
import { AttractClock, allowedNpcDamage, applyNpcHealth, attractModeConfig, attractModePlayers, isGeneratedId, isNpcId, realTeamCounts } from './attractMode.ts'
import { rankVictory } from './victoryRank.ts'
import {
  AUTO_BATTLE_CONFIG,
  AutoBattleClock,
  ambientAttackDamage,
  autoLog,
  bigAutoAttackById,
  isFieldDummy,
  type AutoAction,
} from './autoBattle.ts'
import { noteConsoleError } from '../preflight/session.ts'
import { cinemaOf } from '../game/attacks/cinema.ts'
import { styles, type AttackStyle } from '../game/attacks/style.ts'
import { AttackSystem } from './AttackSystem.ts'
import { BattleSystem } from './BattleSystem.ts'
import { ComboSystem } from './ComboSystem.ts'
import { DamageSystem } from './DamageSystem.ts'
import { giftPower } from './giftPower.ts'
import { MomentumSystem } from './MomentumSystem.ts'
import { freshRoster, PlayerSystem } from './PlayerSystem.ts'
import { nextRoundCue } from './roundCue.ts'
import { SoundManager } from './SoundSystem.ts'
import { readRound, subscribeRound, writeRound, type RoundStamp } from './RoundSync.ts'
import type { TikTokLiveEvent } from '../integrations/tiktok/TikTokEventTypes.ts'
import {
  claimLock,
  LOCK_TTL_MS,
  postBattle,
  readBattle,
  readLock,
  releaseLock,
  subscribeBattle,
  writeBattle,
  type BattleSave,
  type RosterMember,
  type SyncCommand,
} from './BattleSync.ts'

type MusicLevel = 'normal' | 'rush' | 'final' | 'victory'

export interface SwitchNote {
  id: string
  text: string
  team: TeamId
  fromX: number
  fromY: number
  fromTeam: TeamId
}

const COUNT_MS = 5_000
const FIGHT_MS = 720
const LIKE_BURST_GAP_MS = 0
const GIFT_BURST_GAP_MS = 0
/** Pending attacks above which a like burst collapses to a few heavier bolts. */
const LIKE_CROWD = 90
/** Cinematic gift scenes play at this fraction of their authored length. */
const CINEMA_PACE = 0.34

export class GameDirector {
  readonly players = new PlayerSystem()
  readonly attacks = new AttackSystem()
  readonly combos = new ComboSystem()
  readonly momentum = new MomentumSystem()
  readonly damage = new DamageSystem()
  readonly battle = new BattleSystem()
  readonly sound = new SoundManager()
  meters = { fps: 0, lowestFps: 0, frames: 0, attacks: 0, players: 0, particles: 0, queue: 0 }
  readonly attract = new AttractClock()
  readonly autoBattle = new AutoBattleClock()
  private simViewerIds: string[] = []
  private npcCursor = { red: 0, blue: 0 }

  private readonly seenLiveEvents = new Set<string>()
  private readonly socialOnce = new Set<string>()

  teamAssignMode: TeamAssignMode = battleConfig.teamAssignMode
  cinematic = 0
  cinemaLive = false
  hitStop = 0
  teamFlash = { red: 0, blue: 0 }
  epoch = 1
  topRedId: string | null = null
  topBlueId: string | null = null
  hud: HudSnapshot

  private listeners = new Set<() => void>()
  private readonly chosenTeams = new Map<string, TeamId>()
  private feed: BattleFeedItem[] = []
  private callouts: ComboCallout[] = []
  private announcement: Announcement | null = null
  private powerFlash: PowerFlash | null = null
  private powerFlashLeft = 0
  private selectedId: string | null = null
  private seq = 1
  private raf = 0
  private loopToken = 0
  private last = 0
  private hudAccum = 0
  private dirty = true
  private music: MusicLevel | 'boot' = 'boot'
  private readonly windowId = Math.random().toString(36).slice(2)
  private roundId = ''
  private roundStartedAt = 0
  private activatedRound = ''
  private countdownToken = ''
  private countdownView: { token: string; label: string; level: number } | null = null
  private previewStartedAt = 0
  private nextRoundWall = 0
  private lastResetAt = 0
  private roundNumber = 1
  private combatRound = 1
  private combatSealed = false
  private countdownKind: 'opening' | 'next' = 'opening'
  private restarting = false
  private victoryArmedAt = 0
  private concluding = false
  private resultsCountdownLogged = false
  private roundBumped = false
  private readonly roster = new Map<string, RosterMember>()
  private previewSerial = 0
  private role: 'lead' | 'follow' = 'lead'
  private readonly roleListeners = new Set<() => void>()
  private revision = 0
  private appliedRevision = 0
  private roleAccum = 0
  private saveAccum = 0
  private readonly seenAttacks = new Set<number>()
  private switchNotes: SwitchNote[] = []

  get leading(): boolean {
    return this.role === 'lead'
  }

  /** Team switches since the last call, for the battlefield to animate once. */
  takeSwitchNotes(): SwitchNote[] {
    if (this.switchNotes.length === 0) return []
    const notes = this.switchNotes
    this.switchNotes = []
    return notes
  }

  /** The stage window takes the shared match so a refresh keeps one live game. */
  reclaim(): void {
    const save = readBattle()
    if (save && save.owner !== this.windowId) this.importSave(save, true)
    if (this.role !== 'lead') this.setRole('lead')
    const trimmed = this.players.trimGenerated(battleConfig.rosterRed, battleConfig.rosterBlue)
    claimLock(this.windowId)
    this.writeSave(true)
    if (trimmed > 0) this.publish()
  }

  onRole = (listener: () => void): (() => void) => {
    this.roleListeners.add(listener)
    return () => this.roleListeners.delete(listener)
  }

  constructor() {
    const save = readBattle()
    const lock = readLock()
    const lockHeld = !!lock && lock.id !== this.windowId && Date.now() - lock.at < LOCK_TTL_MS
    if (save && Date.now() - save.savedAt < 6 * 60 * 60 * 1000) this.importSave(save, true)
    else this.reset()
    this.setRole(lockHeld ? 'follow' : 'lead')
    if (this.role === 'lead') {
      const trimmed = this.players.trimGenerated(battleConfig.rosterRed, battleConfig.rosterBlue)
      claimLock(this.windowId)
      if (trimmed > 0) this.writeSave(true)
    }
    subscribeRound((stamp) => this.adoptRound(stamp))
    subscribeBattle((message) => this.onBattleMessage(message))
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => {
        if (this.role !== 'lead') return
        this.writeSave(true)
        releaseLock(this.windowId)
      })
    }
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
        const raw = Math.max(0.001, (now - this.last) / 1000)
        const dt = Math.min(0.05, raw)
        this.last = now
        this.noteFrame(raw)
        this.tick(dt, now)
      } catch (error) {
        console.error(error)
        noteConsoleError()
      }
      if (token !== this.loopToken) return
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  private noteFrame(raw: number): void {
    const fps = 1 / raw
    const meters = this.meters
    meters.fps = meters.frames === 0 ? fps : meters.fps * 0.85 + fps * 0.15
    meters.frames += 1
    if (meters.frames > 45) meters.lowestFps = meters.lowestFps === 0 ? fps : Math.min(meters.lowestFps, fps)
    meters.attacks = this.attacks.pending
    meters.players = this.players.players.size
    meters.queue = this.attacks.queue.length
  }

  stopLoop(): void {
    this.loopToken += 1
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  start(): void {
    if (this.relay({ name: 'start' })) return
    if (this.battle.status === 'paused') this.battle.status = 'running'
    this.publish()
  }

  pause(): void {
    if (this.relay({ name: 'pause' })) return
    if (this.battle.status === 'running') this.battle.status = 'paused'
    this.publish()
  }

  reset(): void {
    if (this.relay({ name: 'reset' })) return
    const now = Date.now()
    if (now - this.lastResetAt < 450) return
    const existing = readRound()
    if (existing && existing.id !== this.roundId && now - existing.startedAt < COUNT_MS + FIGHT_MS) {
      this.lastResetAt = now
      this.adoptRound(existing)
      return
    }
    this.lastResetAt = now
    this.nextRoundWall = 0
    this.prepareRound()
    this.roundId = ''
    this.roundStartedAt = 0
    this.publish()
    this.writeSave(true)
    const issued = this.lastResetAt
    requestAnimationFrame(() => {
      if (this.lastResetAt !== issued || this.roundId) return
      this.publishRound(Date.now())
      this.publish()
      this.writeSave(true)
    })
  }

  previewCountdown(): void {
    if (this.relay({ name: 'preview' })) return
    if (this.battle.status === 'countdown') return
    if (this.previewStartedAt && Date.now() - this.previewStartedAt < COUNT_MS + FIGHT_MS) return
    const serial = ++this.previewSerial
    requestAnimationFrame(() => {
      if (serial !== this.previewSerial || this.battle.status === 'countdown') return
      this.previewStartedAt = Date.now()
      this.countdownToken = ''
      this.publish()
    })
  }

  setDuration(seconds: number): void {
    if (this.relay({ name: 'duration', seconds })) return
    const ms = Math.max(15, Math.min(30 * 60, seconds)) * 1000
    this.battle.setDuration(ms)
    this.publish()
  }

  runForever(): void {
    if (this.relay({ name: 'forever' })) return
    this.battle.runForever()
    this.setMusic('normal')
    this.publish()
  }

  stopBattle(): void {
    if (this.relay({ name: 'stop' })) return
    this.endRound(this.battle.winnerFromScore())
  }

  endRound(winner: VictoryResult): void {
    if (this.relay({ name: 'end', winner })) return
    if (this.battle.status !== 'running') return
    const contributions = this.players.leaderboard(24).map((entry) => ({
      id: entry.id,
      username: entry.username,
      team: entry.team,
      battlePoints: entry.battlePoints,
      participated: entry.participated === true,
    }))
    const leaders = rankVictory(this.players.leaderboard(24), winner).map((entry) => ({ ...entry }))
    const portraits = this.portraitsFor(winner)
    const country = winner === 'red' ? 'canada' : winner === 'blue' ? 'usa' : 'draw'
    console.log('BATTLE ENDED', country)
    console.log('FINAL PLAYER CONTRIBUTIONS', contributions)
    console.log('TOP 3 SNAPSHOT', leaders.map((entry) => ({ username: entry.username, team: entry.team, battlePoints: entry.battlePoints })))
    if (!this.battle.lockVictory(winner, leaders, portraits)) return
    this.resultsCountdownLogged = false
    console.log('RESULTS STATE STARTED')
    this.invalidateCombat()
    const label = winner === 'red' ? 'RED' : winner === 'blue' ? 'BLUE' : 'DRAW'
    console.log(`[ROUND] Winner: ${label}`)
    console.log('[ROUND] Combat locked')
    const loser = winner === 'red' ? 'blue' : winner === 'blue' ? 'red' : null
    if (loser) this.teamFlash[loser] = 1
    if (winner === 'red' || winner === 'blue') this.players.cheer(winner)
    this.cinematic = Math.max(this.cinematic, 0.42)
    this.nextRoundWall = 0
    this.setMusic('victory')
    this.sound.play('victory')
    this.dirty = true
    this.publish()
    this.writeSave(true)
  }

  skipVictory(): void {
    if (this.relay({ name: 'skipVictory' })) return
    if (this.battle.status === 'running') this.endRound(this.battle.winnerFromScore())
    if (this.battle.status !== 'victory') return
    this.battle.victoryEndsAt = Date.now()
    this.openCountdown(true)
  }

  resetRound(): void {
    if (this.relay({ name: 'resetRound' })) return
    if (this.battle.status === 'countdown' || this.battle.status === 'resetting') return
    this.openCountdown(false)
  }

  jumpTo(ms: number): void {
    if (this.relay({ name: 'jump', ms })) return
    this.battle.jumpTo(Math.max(0, ms))
    this.publish()
  }

  setWinCondition(condition: WinCondition): void {
    if (this.relay({ name: 'win', condition })) return
    this.battle.winCondition = condition
    this.publish()
  }

  setTeamAssignMode(mode: TeamAssignMode): void {
    if (this.relay({ name: 'assign', mode })) return
    this.teamAssignMode = mode
    this.publish()
  }

  toggleMute(): void {
    if (this.relay({ name: 'mute' })) return
    this.sound.toggle()
    this.publish()
  }

  addRandom(count: number, team?: TeamId): void {
    if (this.relay({ name: 'crowd', count, team })) return
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

  receiveLive(event: TikTokLiveEvent): void {
    if (!this.leading) {
      postBattle({ type: 'event', event })
      return
    }
    this.applyRemoteEvent(event)
  }

  /** The one join/switch path for real TikTok chat, /admin tests and the simulator. */
  handleJoin(userId: string, username: string, avatarUrl: string, preferred: TeamId, explicit = false): void {
    if (explicit) console.log(`TEAM COMMAND DETECTED: ${teamLabel(preferred)} @${username}`)
    let existing = this.players.players.get(userId) ?? this.viewerByName(username) ?? null
    if (explicit) console.log(`PLAYER FOUND: ${existing ? 'true' : 'false'}`)
    if (existing && explicit && this.isDefeated(existing.id)) {
      console.log(`PLAYER DEFEATED - REJOINING @${username}`)
      this.roster.delete(existing.id)
      this.players.remove(existing.id)
      existing = null
    }
    const decision = decideJoin(existing, preferred, explicit)
    if (existing && decision === 'keep') {
      if (explicit) console.log(`CURRENT TEAM: ${teamLabel(existing.team)} (already there, no duplicate)`)
      if (avatarUrl) this.players.refreshAvatar(existing.id, avatarUrl)
      if (explicit) {
        this.chosenTeams.set(`explicit:${existing.id}`, existing.team)
        this.players.spotlight(existing.id)
      }
      this.rememberTeam(existing.id, username, existing.team)
      this.rememberMember(existing.id)
      if (explicit) this.shareNow()
      return
    }
    if (existing && decision === 'switch') {
      console.log(`CURRENT TEAM: ${teamLabel(existing.team)}`)
      console.log(`SWITCHING ${teamLabel(existing.team)} -> ${teamLabel(preferred)}`)
      if (avatarUrl) this.players.refreshAvatar(existing.id, avatarUrl)
      const before = this.players.bodies.get(existing.id)
      const from = before ? { x: before.x, y: before.y, team: before.team } : null
      this.players.setTeam(existing.id, preferred)
      this.players.spotlight(existing.id)
      this.chosenTeams.set(`explicit:${existing.id}`, preferred)
      this.rememberTeam(existing.id, username, preferred)
      this.rememberMember(existing.id)
      if (from) this.switchNotes.push({ id: existing.id, text: `@${username} → ${teamFlag(preferred)} ${teamLabel(preferred)}`, team: preferred, fromX: from.x, fromY: from.y, fromTeam: from.team })
      if (this.switchNotes.length > 12) this.switchNotes.splice(0, this.switchNotes.length - 12)
      this.shareNow()
      return
    }
    const id = userId || `fan-${username.trim().toLowerCase() || 'guest'}`
    this.players.add({
      id,
      username,
      team: preferred,
      avatarUrl,
      avatarKey: '',
      initials: initialsOf(username),
    })
    this.players.spotlight(id)
    if (explicit) {
      this.chosenTeams.set(`explicit:${id}`, preferred)
      console.log(`PLAYER CREATED @${username} -> ${teamLabel(preferred)}`)
    }
    this.rememberTeam(id, username, preferred)
    this.rememberMember(id)
    this.shareNow()
  }

  /** Pushes a roster change to the HUD and every other window right away instead of on the next save tick. */
  private shareNow(): void {
    this.publish()
    if (this.role === 'lead') this.writeSave(true)
  }

  /** Name fallback for viewers without an id; never hands a real viewer a filler player's circle. */
  private viewerByName(username: string | undefined): Player | undefined {
    const name = username?.trim().toLowerCase()
    if (!name) return undefined
    for (const player of this.players.players.values()) {
      if (player.isNpc || isNpcId(player.id) || isGeneratedId(player.id)) continue
      if (player.username.trim().toLowerCase() === name) return player
    }
    return undefined
  }

  handleLeave(userId: string, username: string): void {
    const player = this.players.players.get(userId)
    if (!player) return
    const team = player.team
    this.roster.delete(userId)
    this.players.remove(userId)
    if (this.selectedId === userId) this.selectedId = null
    this.pushFeed(`@${username} left ${team.toUpperCase()}`, team, 'neutral')
    this.publish()
  }

  handleGift(event: GiftEvent): void {
    const team = this.sideFor(event.userId, event.username, event.team)
    if (!team) {
      console.log(`[EVENT IGNORED - USER NOT ON TEAM] ${event.username || 'unknown'}`)
      return
    }
    const settled: GiftEvent = { ...event, team }
    if (!this.combatOpen) return
    const value = Math.max(0, settled.coinValue ?? 0) * Math.max(1, settled.giftCount)
    console.log(`[GIFT ATTACK] ${settled.username} | ${settled.giftName} | ${value}`)
    this.resolveGift(settled, Math.max(1, settled.giftCount), performance.now())
    this.dirty = true
  }

  handleLike(team: TeamId | undefined, count: number, userId?: string, username?: string, avatarUrl = ''): void {
    const name = username || 'viewer'
    if (!userId && !username) {
      console.log('[EVENT IGNORED - USER NOT ON TEAM] unknown')
      return
    }
    const chosen = this.sideFor(userId, name, team)
    if (!chosen) {
      console.log(`[EVENT IGNORED - USER NOT ON TEAM] ${name}`)
      return
    }
    if (!this.combatOpen) return
    console.log(`[LIKE ATTACK] ${name} x ${Math.max(1, Math.round(count) || 1)}`)
    this.autoBattle.noteViewer(performance.now(), 'like')
    const id = this.ensureOnField(userId, username || 'guest', chosen, avatarUrl)
    const side = this.battle.team(chosen)
    const plan = likeShotPlan(count)
    const amount = plan.amount
    side.likesTotal += amount
    side.likeBank += amount
    side.score += amount * battleConfig.likeScoreEach
    this.creditViewer(id, amount * battleConfig.likeScoreEach)
    const origin = this.launcher(chosen, id)
    const frenzy = amount >= 100 ? 4 : amount >= 50 ? 3 : amount >= 25 ? 2 : amount >= 10 ? 1 : 0
    const crowded = this.attacks.pending > LIKE_CROWD
    const shots = crowded ? Math.min(plan.shots, 3) : plan.shots
    const boltDamage = plan.totalDamage / shots
    for (let i = 0; i < shots; i += 1) {
      const foe = this.aim(chosen)
      this.launch(
        {
          attackType: 'energy_bullet',
          team: chosen,
          fromX: origin.x,
          fromY: origin.y,
          toX: foe.x,
          toY: foe.y,
          targetId: foe.id,
          intensity: 0.62 + frenzy * 0.08,
          duration: 0.7,
          damage: boltDamage,
          shake: 'none',
          particleIntensity: frenzy >= 3 ? 0.45 : 0.2,
          sound: 'projectile',
          priority: 2,
          username: username || chosen.toUpperCase(),
          giftName: 'Like',
          combo: amount,
          rarity: 'micro',
          impacts: [0.74],
          power: 1 + frenzy * 0.06,
        },
        i * LIKE_BURST_GAP_MS,
      )
    }
    if (origin.id) this.players.pulse(origin.id)
    if (origin.id && frenzy >= 3) this.players.swell(origin.id, 0.06, 0.22)
    const thresholds = [...battleConfig.likeThresholds].sort((a, b) => b.likes - a.likes)
    for (const threshold of thresholds) {
      if (side.likeBank < threshold.likes) continue
      side.likeBank -= threshold.likes
      side.score += threshold.score
      this.creditViewer(id, threshold.score)
      this.spawnPulse(side.id, threshold.intensity, threshold.damage, `${threshold.likes.toLocaleString('en-US')} likes`, id)
      if (origin.id) this.players.swell(origin.id, threshold.likes >= 1000 ? 3.4 : threshold.likes >= 500 ? 2.9 : 2.4, 0.48)
      this.pushFeed(`${side.name} surged · ${threshold.likes.toLocaleString('en-US')} likes`, side.id, side.id)
      this.sound.play('whoosh', Math.max(0.45, threshold.intensity))
      break
    }
    this.publish()
  }

  handleFollow(username: string, team: TeamId | undefined, userId?: string, avatarUrl = ''): void {
    if (!this.combatOpen) return
    this.autoBattle.noteViewer(performance.now(), 'follow')
    if (!acceptSocial(this.socialOnce, 'follow', userId || username)) return
    const chosen = this.sideFor(userId, username, team)
    if (!chosen) {
      console.log(`[EVENT IGNORED - USER NOT ON TEAM] ${username || 'unknown'}`)
      return
    }
    const id = this.ensureOnField(userId, username, chosen, avatarUrl)
    this.spawnFollow(chosen, id, username)
    const side = this.battle.team(chosen)
    side.score += battleConfig.followScore
    this.creditViewer(id, battleConfig.followScore)
    this.pushFeed(`@${username} followed`, side.id, side.id)
    this.publish()
  }

  handleShare(username: string, team: TeamId | undefined, userId?: string, avatarUrl = ''): void {
    if (!this.combatOpen) return
    this.autoBattle.noteViewer(performance.now(), 'share')
    if (!acceptSocial(this.socialOnce, 'share', userId || username)) return
    const chosen = this.sideFor(userId, username, team)
    if (!chosen) {
      console.log(`[EVENT IGNORED - USER NOT ON TEAM] ${username || 'unknown'}`)
      return
    }
    const id = this.ensureOnField(userId, username, chosen, avatarUrl)
    this.spawnShare(chosen, id, username)
    const side = this.battle.team(chosen)
    side.score += battleConfig.shareScore
    this.creditViewer(id, battleConfig.shareScore)
    this.pushFeed(`@${username} shared the battle`, side.id, side.id)
    this.publish()
  }

  handleComment(userId: string, username: string, avatarUrl = ''): void {
    if (!this.combatOpen) return
    this.autoBattle.noteViewer(performance.now(), 'comment')
    const chosen = this.choiceFor(userId, username) ?? this.players.players.get(userId)?.team ?? this.playerByName(username)?.team
    if (!chosen) {
      console.log(`[EVENT IGNORED - USER NOT ON TEAM] ${username || 'unknown'}`)
      return
    }
    const id = this.ensureOnField(userId, username, chosen, avatarUrl)
    this.spawnComment(chosen, id, username)
    this.publish()
  }

  onImpact(command: AttackCommand, x: number, y: number, tickIndex: number): number {
    if (command.ambient) return this.onAmbientImpact(command, tickIndex)
    if (command.npcKind) return this.onNpcImpact(command, tickIndex)
    if (!this.leading) {
      if (tickIndex === 0) this.sound.playImpact(command)
      return 0
    }
    if (command.roundToken != null && command.roundToken !== this.combatRound) return 0
    if (!this.combatOpen) return 0
    if (command.damage <= 0) {
      if (tickIndex === 0) this.sound.playImpact(command)
      return 0
    }
    const portion = command.damage / Math.max(1, command.impacts.length)
    const { dealt, target } = this.strikeTeam(command.team, portion)
    this.players.flinch(target, x, y, Math.min(1.15, 0.35 + command.intensity * 0.45))
    if (tickIndex === 0 && command.targetId) {
      const marked = this.players.bodies.get(command.targetId)
      if (marked && marked.team !== command.team) this.players.strike(command.targetId, avatarHit(command))
    }
    const flash = command.rarity === 'legendary' ? 0.9 : command.rarity === 'large' ? 0.55 : 0.22 + command.intensity * 0.18
    this.teamFlash[target] = Math.min(1, this.teamFlash[target] + flash)
    if (tickIndex === 0) {
      this.sound.playImpact(command)
      if (command.rarity === 'legendary') this.cinematic = Math.max(this.cinematic, 0.9)
      else if (command.rarity === 'large') this.cinematic = Math.max(this.cinematic, 0.48)
      if (command.rarity === 'large' || command.rarity === 'legendary' || command.intensity >= 1) this.players.cheer(command.team)
    }
    this.dirty = true
    return dealt
  }

  /**
   * Takes the same number of points from the enemy team for every person this hit reaches.
   * Returns that per-person amount so the battlefield can show it.
   */
  spendHitPoints(command: AttackCommand, people: number): number {
    if (command.damage <= 0) return 0
    const each = hitPointEach(command, people)
    if (each <= 0 || people <= 0 || command.npcKind) return 0
    if (!this.leading) return each
    if (command.roundToken != null && command.roundToken !== this.combatRound) return 0
    if (!this.combatOpen || this.battle.status !== 'running') return 0
    const enemy = command.team === 'red' ? this.battle.blue : this.battle.red
    enemy.score = Math.max(0, enemy.score - each * people)
    this.dirty = true
    return each
  }

  /** Knocks every extra opponent a shot connects with. Team health still drops once in onImpact. */
  splashStrike(command: AttackCommand, ids: readonly string[]): void {
    if (command.ambient || command.npcKind || command.damage <= 0) return
    for (const id of ids) {
      if (!id || id === command.targetId) continue
      const marked = this.players.bodies.get(id)
      if (!marked || marked.team === command.team || marked.dying > 0) continue
      this.players.strike(id, avatarHit(command))
    }
  }

  /**
   * Applies damage to the enemy team's real HP, then finishes from that new value.
   * A second projectile in the same turn sees the battle is no longer running.
   */
  private strikeTeam(attacker: TeamId, amount: number): { dealt: number; target: TeamId } {
    const target: TeamId = attacker === 'red' ? 'blue' : 'red'
    if (this.concluding || this.battle.status !== 'running') return { dealt: 0, target }
    const { dealt, next } = this.damage.apply(attacker, amount, this.battle.red, this.battle.blue)
    if (next <= 0) this.conclude()
    return { dealt, target }
  }

  private conclude(): void {
    if (this.concluding || this.battle.status !== 'running') return
    const winner = this.battle.wipeWinner() ?? this.winnerByFighters()
    if (!winner) return
    this.concluding = true
    try {
      this.endRound(winner)
    } finally {
      this.concluding = false
    }
  }

  /** A side with nobody left standing has lost, even if the big health pool has not reached 0. */
  private winnerByFighters(): VictoryResult | null {
    const red = this.livingFighters('red')
    const blue = this.livingFighters('blue')
    if (red > 0 && blue > 0) return null
    if (red === 0 && blue === 0) return null
    return red > 0 ? 'red' : 'blue'
  }

  private livingFighters(team: TeamId): number {
    let count = 0
    for (const player of this.players.players.values()) {
      if (player.team !== team || player.isNpc || isNpcId(player.id)) continue
      const body = this.players.bodies.get(player.id)
      if (!body || body.hp <= 0 || body.dying > 0) continue
      count += 1
    }
    return count
  }

  private onNpcImpact(command: AttackCommand, tickIndex: number): number {
    if (!this.leading) {
      if (tickIndex === 0) this.sound.playImpact(command)
      return 0
    }
    if (command.roundToken != null && command.roundToken !== this.combatRound) return 0
    if (!this.combatOpen) return 0
    const target = command.team === 'red' ? this.battle.blue : this.battle.red
    const budget = { dealt: this.attract.damageDealt }
    const dealt = applyNpcHealth(target, budget, command.damage)
    this.attract.damageDealt = budget.dealt
    if (tickIndex === 0) {
      this.sound.playImpact(command)
      if (dealt > 0) this.teamFlash[target.id] = Math.min(0.28, this.teamFlash[target.id] + 0.08)
    }
    this.dirty = true
    return dealt
  }

  private onAmbientImpact(command: AttackCommand, tickIndex: number): number {
    if (!this.leading) {
      if (tickIndex === 0) this.sound.playImpact(command)
      return 0
    }
    if (command.roundToken != null && command.roundToken !== this.combatRound) return 0
    if (!this.combatOpen) return 0
    const target = command.team === 'red' ? this.battle.blue : this.battle.red
    const portion = command.damage / Math.max(1, command.impacts.length)
    const room = Math.max(0, target.health - 1)
    const dealt = Math.max(0, Math.min(room, portion))
    target.health -= dealt
    if (tickIndex === 0) this.sound.playImpact(command)
    this.dirty = true
    return dealt
  }

  previewNpc(kind: 'maple' | 'star'): void {
    if (this.battle.status !== 'running') this.battle.status = 'running'
    this.retireGuardians()
    this.fireNpc(kind === 'maple' ? 'red' : 'blue')
  }

  setAttractEnabled(enabled: boolean): void {
    attractModeConfig.enabled = enabled
    if (enabled && attractModeConfig.override === 'stop') attractModeConfig.override = 'auto'
    this.publish()
  }

  startAttract(): void {
    attractModeConfig.enabled = true
    attractModeConfig.override = 'start'
    this.publish()
  }

  stopAttract(): void {
    attractModeConfig.override = 'stop'
    this.publish()
  }

  syncAttract(): void {
    this.publish()
  }

  simulateRealJoin(team: TeamId): void {
    const id = `viewer-sim-${this.simViewerIds.length + 1}`
    this.players.add({ id, username: 'Viewer', team, avatarUrl: '', avatarKey: '', initials: 'V' })
    this.simViewerIds.push(id)
    this.publish()
  }

  simulateRealLeave(): void {
    const id = this.simViewerIds.pop()
    if (!id) return
    this.players.remove(id)
    this.publish()
  }

  private motionMood(): { finalTen: boolean; lead: 'red' | 'blue' | null; hidden: boolean; settled: boolean } {
    const red = this.battle.red.score
    const blue = this.battle.blue.score
    return {
      finalTen: this.battle.phase === 'final_10',
      lead: red === blue ? null : red > blue ? 'red' : 'blue',
      hidden: typeof document !== 'undefined' && document.hidden,
      settled: this.battle.status === 'victory',
    }
  }

  private tick(dt: number, now: number): void {
    this.considerRole(dt)
    this.maybeStartNextRound()
    this.sound.followBattle(this.battle.status, this.battle.phase, this.battle.timeLeftMs, this.battle.endless)
    if (this.role === 'follow') {
      this.stepAttract(dt, now, false)
      const motion = dt * (this.hitStop > 0 ? 0.38 : 1)
      this.hitStop = Math.max(0, this.hitStop - dt)
      if (this.battle.status === 'running' && this.battle.endless) this.battle.elapsedMs += dt * 1000
      else if (this.battle.status === 'running') this.battle.timeLeftMs = Math.max(0, this.battle.timeLeftMs - dt * 1000)
      if (this.combatOpen) this.attacks.release(now)
      this.players.update(motion, now / 1000, this.combatOpen, this.motionMood())
      this.advanceIfLeadIsQuiet(dt)
      this.hudAccum += dt
      if (this.dirty || this.hudAccum > 0.1) {
        this.publish()
        this.dirty = false
        this.hudAccum = 0
      }
      return
    }
    this.stepAttract(dt, now, true)
    const motion = dt * (this.hitStop > 0 ? 0.38 : 1)
    this.hitStop = Math.max(0, this.hitStop - dt)
    if (this.battle.status === 'countdown' && !this.roundId) this.publishRound(Date.now())
    const countdownChanged = this.syncCountdown()
    this.players.update(motion, now / 1000, this.combatOpen, this.motionMood())
    if (this.combatOpen) {
      this.momentum.tick(dt, now, this.battle.red, this.battle.blue)
      this.combos.decay(now)
      this.attacks.release(now)
    }
    if (this.battle.status === 'victory') this.cinematic = Math.max(this.cinematic, 0.4)
    else if (this.attacks.winding) this.cinematic = Math.max(this.cinematic, 0.62)
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
    if (this.powerFlash) {
      this.powerFlashLeft -= dt
      if (this.powerFlashLeft <= 0) {
        this.powerFlash = null
        this.powerFlashLeft = 0
        this.dirty = true
      }
    }

    this.stepAutoBattle(now)

    this.conclude()
    const signals = this.battle.tick(dt)
    if (signals.enteredRush) {
      this.setMusic('rush')
      this.pushFeed('FINAL RUSH', undefined, 'gold')
    }
    if (this.battle.phase === 'final_10') this.setMusic('final')
    else if (this.battle.phase === 'final_rush') this.setMusic('rush')
    else if (this.battle.status === 'running') this.setMusic('normal')
    if (this.battle.status === 'running') {
      const clockSecond = this.battle.phase === 'final_10' ? Math.ceil(this.battle.timeLeftMs / 1000) : null
      this.sound.observeLead(this.battle.red.score, this.battle.blue.score)
      this.sound.observeMatch(this.battle.red.score, this.battle.blue.score, this.battle.phase, clockSecond)
    }
    if (signals.finalSecond != null) this.sound.play('countdown', (11 - signals.finalSecond) / 10)
    if (
      this.battle.status === 'victory' &&
      !this.resultsCountdownLogged &&
      this.battle.victoryElapsed >= 8000
    ) {
      this.resultsCountdownLogged = true
      console.log('RESULTS COUNTDOWN STARTED')
    }
    if (signals.roundOver || this.battle.status === 'resetting') this.openCountdown(true)
    this.sound.followBattle(this.battle.status, this.battle.phase, this.battle.timeLeftMs, this.battle.endless)

    this.hudAccum += dt
    if (this.dirty || signals.changed || countdownChanged || this.hudAccum > 0.1) {
      this.publish()
      this.dirty = false
      this.hudAccum = 0
    }
  }

  private resolveGift(event: GiftEvent, count: number, now: number): void {
    const team = this.prepareSender(event)
    const catalog = resolveGift(event.giftId, event.giftName, event.coinValue)
    const liveName = event.giftName.trim()
    const gift = {
      ...catalog,
      name: liveName || catalog.name,
      displayName: liveName || catalog.displayName,
      image: event.image || catalog.image,
    }
    const preview = event.preview === true
    const combo = preview
      ? { total: 1, milestone: null as number | null }
      : this.combos.register(event.userId, gift.id, count, gift.comboEligible, now)
    const visuals = preview ? count : Math.max(0, event.visualCount ?? count)
    const damage = preview ? 0 : scaledDamage(gift.baseDamage, count, combo.total)
    const score = preview ? 0 : Math.max(1, Math.round(gift.scoreValue * count * comboScoreFactor(combo.total)))
    const intensity = gift.animationIntensity * comboIntensity(combo.total)
    const player = this.players.players.get(event.userId)
    const coins = Math.max(0, event.coinValue ?? gift.coinValue) * Math.max(1, count)
    const power = giftPower(coins)
    const scene = cinemaOf({ giftId: gift.id, giftName: gift.displayName, attackType: gift.attackType, rarity: gift.rarity })
    const flight = (scene ? scene.duration * CINEMA_PACE : flightSeconds(gift.rarity, gift.attackType)) * power.pace
    const impacts = scene ? [...scene.impacts] : attackImpacts[gift.attackType]
    const requested = Math.max(0, Math.round(visuals) || 0)
    const cap = scene ? 1 : gift.rarity === 'legendary' || gift.rarity === 'large' ? 6 : 8
    const burst = Math.min(requested, cap)
    const body = this.players.bodies.get(event.userId)
    const from = body ?? (team === 'red' ? { x: 0.28, y: 0.5 } : { x: 0.72, y: 0.5 })
    for (let i = 0; i < burst; i += 1) {
      const foe = this.aim(team)
      const spread = burst > 1 ? 0.035 : 0
      this.launch(
        {
          attackType: gift.attackType,
          team,
          fromX: from.x,
          fromY: from.y,
          toX: foe.x + (Math.random() - 0.5) * spread,
          toY: foe.y + (Math.random() - 0.5) * spread,
          targetId: i === 0 ? foe.id : undefined,
          intensity,
          duration: flight,
          damage: burst > 0 ? damage / burst : 0,
          shake: shakeFor(gift, combo.total),
          particleIntensity: gift.particleIntensity * comboIntensity(combo.total),
          sound: gift.soundEffect,
          priority: rarityPriority[gift.rarity],
          username: event.username,
          giftName: gift.displayName,
          combo: combo.total,
          rarity: gift.rarity,
          impacts,
          power: i === 0 ? power.size : Math.max(1.15, power.size * 0.7),
        },
        i * GIFT_BURST_GAP_MS,
      )
    }
    this.players.powerUp(event.userId, power.growth, 0.15)
    if (!preview && player) {
      player.giftValue += coins
      player.giftCount += count
      player.battlePoints += score
      player.damageDealt += damage
      player.participated = true
      player.largestCombo = Math.max(player.largestCombo, combo.total)
    }
    if (!preview) {
      this.autoBattle.noteViewer(performance.now(), 'gift', gift.rarity)
      this.battle.team(team).score += score
      this.pushFeed(describeGift(event.username, gift, count), team, team)
    }

    if (!preview && combo.milestone && combo.milestone >= 2) {
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
      this.sound.play('combo', Math.min(1, combo.milestone / 45), team)
      this.pushFeed(`@${event.username} hit ${combo.milestone}× ${gift.displayName}`, team, 'gold')
    }

    const rush = preview ? null : this.momentum.registerGift(team, event.userId, (event.coinValue ?? gift.coinValue) * count, now, this.battle.team(team))
    if (rush) {
      this.pushFeed(rush.label, rush.team, rush.team)
      this.sound.cueMomentum(rush.team)
    }
    if (!preview) this.sound.cueGift(gift.rarity, team)
    this.powerFlash = {
      id: `p${this.seq++}`,
      name: gift.displayName,
      attack: attackHeadlines[gift.attackType],
      icon: gift.icon,
      image: gift.image ?? event.image,
    }
    this.powerFlashLeft = 2

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
        this.cinematic = 0.12
        this.sound.cueUltimateCharge(team)
      }
    }

    if (!preview && burst <= 0 && damage > 0 && this.combatOpen) this.strikeTeam(team, damage)
    this.dirty = true
  }

  private prepareSender(event: GiftEvent): TeamId {
    const team = this.sideFor(event.userId, event.username, event.team) ?? event.team ?? 'red'
    const existing = this.players.players.get(event.userId) ?? this.playerByName(event.username)
    if (existing) {
      if (existing.team !== team && !this.isLocked(existing.id)) {
        this.players.setTeam(existing.id, team)
        this.pushFeed(`@${event.username} joined ${team.toUpperCase()}`, team, team)
      }
      this.rememberMember(existing.id)
      return existing.team
    }
    this.players.add({
      id: event.userId,
      username: event.username,
      team,
      avatarUrl: event.avatarUrl,
      avatarKey: '',
      initials: initialsOf(event.username),
    })
    this.rememberMember(event.userId)
    this.pushFeed(`@${event.username} joined ${team.toUpperCase()}`, team, team)
    return team
  }

  private rememberTeam(userId: string, username: string, team: TeamId): void {
    if (userId) this.chosenTeams.set(`id:${userId}`, team)
    const name = username.trim().toLowerCase()
    if (name) this.chosenTeams.set(`name:${name}`, team)
  }

  private isLocked(id: string): boolean {
    return this.chosenTeams.has(`explicit:${id}`)
  }

  private choiceFor(userId: string | undefined, username: string | undefined): TeamId | null {
    if (userId) {
      const byId = this.chosenTeams.get(`id:${userId}`)
      if (byId) return byId
    }
    const name = username?.trim().toLowerCase()
    if (!name) return null
    return this.chosenTeams.get(`name:${name}`) ?? null
  }

  private isDefeated(id: string): boolean {
    const body = this.players.bodies.get(id)
    return !!body && (body.hp <= 0 || body.dying > 0)
  }

  private sideFor(userId: string | undefined, username: string | undefined, incoming?: TeamId): TeamId | null {
    return this.choiceFor(userId, username) ?? this.players.players.get(userId ?? '')?.team ?? this.playerByName(username)?.team ?? incoming ?? null
  }

  private playerByName(username: string | undefined): { id: string; team: TeamId } | undefined {
    const name = username?.trim().toLowerCase()
    if (!name) return undefined
    for (const player of this.players.players.values()) {
      if (player.username.trim().toLowerCase() === name) return player
    }
    return undefined
  }

  previewAttack(style: AttackStyle, team: TeamId = 'red', damage = 48): void {
    const spec = styles[style]
    const origin = this.launcher(team)
    const foe = this.aim(team)
    const name = origin.id ? this.players.players.get(origin.id)?.username ?? 'Preview' : 'Preview'
    this.launch({
      attackType: spec.attackType,
      team,
      fromX: origin.x,
      fromY: origin.y,
      toX: foe.x,
      toY: foe.y,
      targetId: foe.id,
      intensity: spec.temporaryScale,
      duration: spec.duration,
      damage,
      shake: spec.shake,
      particleIntensity: spec.cameraShake,
      sound: 'magic',
      priority: 8,
      username: name,
      giftName: spec.giftName,
      combo: style === 'eclipse' ? 50 : 1,
      rarity: spec.rarity,
      impacts: spec.impacts,
    })
  }

  private spawnPulse(team: TeamId, intensity: number, damage: number, label: string, userId?: string): void {
    this.autoBattle.noteViewer(performance.now(), 'gift', 'medium')
    const origin = this.launcher(team, userId)
    const foe = this.aim(team)
    this.launch({
      attackType: 'pulse',
      team,
      fromX: origin.x,
      fromY: origin.y,
      toX: foe.x,
      toY: foe.y,
      targetId: foe.id,
      intensity,
      duration: 0.45,
      damage,
      shake: intensity > 0.9 ? 'medium' : 'small',
      particleIntensity: intensity,
      sound: 'whoosh',
      priority: 3,
      username: team.toUpperCase(),
      giftName: label,
      combo: 1,
      rarity: intensity > 0.9 ? 'medium' : 'small',
      impacts: attackImpacts.pulse,
    })
  }

  private spawnFollow(team: TeamId, userId: string | undefined, username: string): void {
    const origin = this.launcher(team, userId)
    const foe = this.aim(team)
    this.launch({
      attackType: 'follow_blast',
      team,
      fromX: origin.x,
      fromY: origin.y,
      toX: foe.x,
      toY: foe.y,
      targetId: foe.id,
      intensity: 1.2,
      duration: 0.44,
      damage: battleConfig.followBlastDamage,
      shake: 'small',
      particleIntensity: 1.15,
      sound: 'explosion',
      priority: 5,
      username,
      giftName: 'Follow',
      combo: 1,
      rarity: 'medium',
      impacts: attackImpacts.follow_blast,
      power: 1.45,
    })
  }

  private spawnShare(team: TeamId, userId: string | undefined, username: string): void {
    const origin = this.launcher(team, userId)
    const foe = this.aim(team)
    this.launch({
      attackType: 'share_shot',
      team,
      fromX: origin.x,
      fromY: origin.y,
      toX: foe.x,
      toY: foe.y,
      targetId: foe.id,
      intensity: 1.05,
      duration: 0.5,
      damage: battleConfig.shareDamage,
      shake: 'medium',
      particleIntensity: 0.95,
      sound: 'projectile',
      priority: 4,
      username,
      giftName: 'Share',
      combo: 1,
      rarity: 'small',
      impacts: attackImpacts.share_shot,
      power: 1.35,
    })
  }

  private spawnComment(team: TeamId, userId: string | undefined, username: string): void {
    const origin = this.launcher(team, userId)
    const foe = this.aim(team)
    const kind = COMMENT_FX[Math.floor(Math.random() * COMMENT_FX.length)] ?? 'sparkle_shot'
    this.launch({
      attackType: kind,
      team,
      fromX: origin.x,
      fromY: origin.y,
      toX: foe.x,
      toY: foe.y,
      targetId: foe.id,
      intensity: 0.85,
      duration: 1,
      damage: battleConfig.commentDamage,
      shake: 'none',
      particleIntensity: 0.45,
      sound: 'magic',
      priority: 2,
      username,
      giftName: 'Comment',
      combo: 1,
      rarity: 'micro',
      impacts: attackImpacts[kind],
    })
    if (origin.id) this.players.swell(origin.id, 0.08, 0.28)
  }

  private launcher(team: TeamId, userId?: string): { id: string | null; x: number; y: number } {
    const found = this.players.livingPoint(team, userId)
    if (found) return found
    return { id: null, x: team === 'red' ? 0.22 : 0.78, y: 0.48 }
  }

  private aim(team: TeamId): { id?: string; x: number; y: number } {
    const enemy = otherTeam(team)
    const foe = this.players.livingPoint(enemy)
    if (foe) return { id: foe.id, x: this.sideX(enemy, foe.x), y: foe.y }
    return { x: team === 'red' ? 0.76 : 0.24, y: 0.48 }
  }

  private sideX(team: TeamId, x: number): number {
    const min = team === 'red' ? 0.06 : 0.54
    const max = team === 'red' ? 0.46 : 0.94
    return Math.min(max, Math.max(min, x))
  }

  private onSide(team: TeamId, x: number): boolean {
    return team === 'red' ? x < 0.5 : x > 0.5
  }

  private ensureOnField(userId: string | undefined, username: string, team: TeamId, avatarUrl = ''): string | undefined {
    const existing = (userId ? this.players.players.get(userId) : undefined) ?? this.viewerByName(username)
    if (existing) {
      if (avatarUrl) this.players.refreshAvatar(existing.id, avatarUrl)
      if (existing.team !== team && !this.isLocked(existing.id)) this.players.setTeam(existing.id, team)
      this.rememberMember(existing.id)
      return existing.id
    }
    const id = userId || `fan-${username.trim().toLowerCase() || 'guest'}`
    this.players.add({
      id,
      username: username || 'guest',
      team,
      avatarUrl,
      avatarKey: '',
      initials: initialsOf(username || 'G'),
    })
    this.players.spotlight(id)
    this.rememberMember(id)
    return id
  }

  private pushFeed(text: string, team: TeamId | undefined, tone: BattleFeedTone): void {
    this.feed.unshift({ id: `f${this.seq++}`, text, team, tone })
    this.feed = this.feed.slice(0, battleConfig.maxFeed)
  }

  private get combatOpen(): boolean {
    return this.battle.status === 'running'
  }

  private sealCombat(): void {
    this.attacks.reset()
    this.powerFlash = null
    this.powerFlashLeft = 0
    this.announcement = null
  }

  private invalidateCombat(): void {
    const pending = this.attacks.pending
    console.log(`[ROUND] Clearing ${pending} projectiles`)
    if (!this.combatSealed) {
      this.combatRound += 1
      this.combatSealed = true
    }
    this.sealCombat()
  }

  /** After a win, start the next countdown once the victory hold is over. */
  private maybeStartNextRound(): void {
    if (this.role !== 'lead' || this.restarting) return
    if (this.battle.status === 'resetting') {
      this.openCountdown(true)
      return
    }
    if (this.battle.status !== 'victory') {
      this.victoryArmedAt = 0
      return
    }
    if (this.victoryArmedAt <= 0) {
      const elapsed = Math.max(0, Math.min(battleConfig.victoryHoldMs, this.battle.victoryElapsed))
      this.victoryArmedAt = Date.now() - elapsed
    }
    if (Date.now() - this.victoryArmedAt >= battleConfig.victoryHoldMs) this.openCountdown(true)
  }

  private openCountdown(increment: boolean): void {
    if (this.battle.status === 'countdown' || this.restarting) return
    this.restarting = true
    console.log('STARTING NEXT BATTLE')
    try {
      console.log('[ROUND] Resetting')
      const fromRound = this.roundNumber
      this.battle.markResetting()
      if (!this.combatSealed) this.invalidateCombat()
      this.combatSealed = false
      this.sealCombat()
      this.autoBattle.stop()
      this.restoreRoster()
      this.players.restoreForRound()
      this.refillDummies()
      this.combos.reset()
      this.momentum.reset()
      this.battle.beginCountdown()
      this.feed = []
      this.callouts = []
      this.announcement = null
      this.selectedId = null
      this.cinematic = 0
      this.teamFlash.red = 0
      this.teamFlash.blue = 0
      this.music = 'boot'
      this.sound.silenceForCountdown()
      this.activatedRound = ''
      this.countdownToken = ''
      this.countdownView = null
      this.previewStartedAt = 0
      this.nextRoundWall = 0
      this.victoryArmedAt = 0
      this.epoch += 1
      if (increment && !this.roundBumped) {
        this.roundNumber += 1
        this.roundBumped = true
        console.log(`[ROUND] Round ID changed ${fromRound} -> ${this.roundNumber}`)
      }
      this.countdownKind = 'next'
      this.publishRound(Date.now())
      this.syncCountdown()
      this.publish()
      this.writeSave(true)
    } finally {
      this.restarting = false
    }
  }

  private refillDummies(): void {
    const counts = { red: 0, blue: 0 }
    for (const player of this.players.players.values()) {
      if (!/^p\d+$/.test(player.id)) continue
      counts[player.team] += 1
    }
    let added = false
    while (counts.red < battleConfig.rosterRed) {
      this.players.addGenerated('red', false)
      counts.red += 1
      added = true
    }
    while (counts.blue < battleConfig.rosterBlue) {
      this.players.addGenerated('blue', false)
      counts.blue += 1
      added = true
    }
    if (added) this.players.layoutAll()
  }

  private restoreRoster(): void {
    for (const member of this.roster.values()) {
      if (this.players.players.has(member.id)) continue
      this.players.add({
        id: member.id,
        username: member.username,
        team: member.team,
        avatarUrl: member.avatarUrl,
        avatarKey: member.avatarKey,
        initials: member.initials,
      })
    }
  }

  private rememberMember(id: string): void {
    const player = this.players.players.get(id)
    if (!player || player.isNpc || isNpcId(player.id) || /^p\d+$/.test(player.id)) return
    this.roster.set(player.id, {
      id: player.id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      avatarKey: player.avatarKey,
      initials: player.initials,
      team: player.team,
    })
  }

  private creditViewer(id: string | undefined, points: number): void {
    if (!id || points <= 0 || isNpcId(id)) return
    const player = this.players.players.get(id)
    if (!player || player.isNpc) return
    player.participated = true
    player.battlePoints += points
  }

  private portraitsFor(winner: VictoryResult): VictoryPortrait[] {
    const seen = new Set<string>()
    const portraits: VictoryPortrait[] = []
    const consider = (id: string, username: string, avatarUrl: string, team: TeamId) => {
      if (isNpcId(id) || /^p\d+$/.test(id)) return
      if (winner !== 'draw' && team !== winner) return
      if (!avatarUrl || seen.has(id) || portraits.length >= 8) return
      seen.add(id)
      portraits.push({ id, username, avatarUrl })
    }
    for (const player of this.players.players.values()) consider(player.id, player.username, player.avatarUrl, player.team)
    for (const member of this.roster.values()) consider(member.id, member.username, member.avatarUrl, member.team)
    return portraits
  }

  private prepareRound(): void {
    this.epoch += 1
    this.players.clear()
    freshRoster(this.players)
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
    this.music = 'boot'
    this.sound.silenceForCountdown()
    this.activatedRound = ''
    this.countdownToken = ''
    this.countdownView = null
    this.previewStartedAt = 0
    this.chosenTeams.clear()
    this.seenLiveEvents.clear()
    this.socialOnce.clear()
    this.roster.clear()
    this.roundNumber = 1
    this.combatRound += 1
    this.combatSealed = false
    this.countdownKind = 'opening'
    this.roundBumped = false
    this.simViewerIds = []
    this.attract.reset()
    this.autoBattle.stop()
    this.retireGuardians()
  }

  private publishRound(startedAt: number): void {
    const stamp: RoundStamp = {
      id: `${this.windowId}-${startedAt}`,
      startedAt,
      owner: this.windowId,
    }
    this.roundId = stamp.id
    this.roundStartedAt = stamp.startedAt
    writeRound(stamp)
  }

  private adoptRound(stamp: RoundStamp): void {
    if (this.role === 'follow') return
    if (!stamp.id || stamp.id === this.roundId) return
    if (this.roundStartedAt > 0 && (this.battle.status === 'countdown' || this.battle.status === 'victory' || this.battle.status === 'resetting')) return
    const now = Date.now()
    const age = now - stamp.startedAt
    if (age > COUNT_MS + FIGHT_MS + 1200) return
    if (this.roundStartedAt) {
      const weAreFresh = now - this.roundStartedAt < 800
      if (weAreFresh && this.roundStartedAt <= stamp.startedAt) return
      if (!weAreFresh && stamp.startedAt < this.roundStartedAt) return
    }
    this.nextRoundWall = 0
    this.lastResetAt = now
    this.prepareRound()
    this.roundId = stamp.id
    this.roundStartedAt = stamp.startedAt
    this.activatedRound = ''
    this.publish()
  }

  private advanceIfLeadIsQuiet(dt: number): void {
    if (typeof document !== 'undefined' && document.hidden) {
      this.mirrorCountdown()
      return
    }
    const lock = readLock()
    const quiet = !lock || lock.id === this.windowId || Date.now() - lock.at > 900
    if (!quiet) {
      this.mirrorCountdown()
      return
    }
    const save = readBattle()
    if (save && save.owner !== this.windowId && save.revision > this.appliedRevision) this.importSave(save, true)
    if (this.battle.status === 'running') return
    if (this.battle.status === 'victory' || this.battle.status === 'resetting') {
      const signals = this.battle.tick(dt)
      if (!signals.roundOver && this.battle.status !== 'resetting') return
      this.setRole('lead')
      claimLock(this.windowId)
      this.openCountdown(true)
      this.publish()
      this.writeSave(true)
      return
    }
    if (this.battle.status !== 'countdown' || this.roundStartedAt <= 0) return
    const elapsed = Date.now() - this.roundStartedAt
    const step = this.countdownKind === 'next' ? nextRoundCue(elapsed) : countdownStep(elapsed)
    if (step) {
      this.mirrorCountdown()
      return
    }
    this.setRole('lead')
    claimLock(this.windowId)
    this.armBattle()
    this.publish()
    this.writeSave(true)
  }

  private mirrorCountdown(): void {
    if (this.battle.status !== 'countdown' || this.roundStartedAt <= 0) return
    const elapsed = Date.now() - this.roundStartedAt
    const step = this.countdownKind === 'next' ? nextRoundCue(elapsed) : countdownStep(elapsed)
    if (!step) return
    const token = `${this.roundId}:${step.label}`
    if (token === this.countdownToken && this.countdownView) return
    this.countdownToken = token
    this.countdownView = { token, label: step.label, level: step.level }
    this.dirty = true
  }

  private armBattle(): void {
    if (!this.roundId) this.publishRound(this.roundStartedAt > 0 ? this.roundStartedAt : Date.now())
    if (this.battle.status === 'running' && this.activatedRound === this.roundId) return
    this.attacks.reset()
    this.battle.victory = null
    this.battle.red.health = this.battle.red.maxHealth
    this.battle.blue.health = this.battle.blue.maxHealth
    this.activatedRound = this.roundId
    this.roundBumped = false
    this.battle.status = 'running'
    console.log(`[ROUND] Round ${this.roundNumber} started`)
    this.previewStartedAt = 0
    this.countdownView = null
    this.countdownToken = ''
    if (this.music !== 'normal') {
      this.music = 'boot'
      this.setMusic('normal')
    }
    this.dirty = true
  }

  private syncCountdown(): boolean {
    const real = this.battle.status === 'countdown' && this.roundStartedAt > 0
    const preview = !real && this.previewStartedAt > 0
    if (!real && !preview) return this.clearCountdownView()
    const startedAt = real ? this.roundStartedAt : this.previewStartedAt
    const prefix = real ? this.roundId : 'preview'
    const elapsed = Date.now() - startedAt
    const step = real && this.countdownKind === 'next' ? nextRoundCue(elapsed) : countdownStep(elapsed)
    if (!step) {
      if (real) this.armBattle()
      else this.previewStartedAt = 0
      return this.clearCountdownView()
    }
    const token = `${prefix}:${step.label}`
    if (token === this.countdownToken && this.countdownView) return false
    this.countdownToken = token
    this.countdownView = { token, label: step.label, level: step.level }
    this.cueCountdown(step.label, real)
    return true
  }

  private clearCountdownView(): boolean {
    if (!this.countdownView && !this.countdownToken) return false
    this.countdownView = null
    this.countdownToken = ''
    return true
  }

  private cueCountdown(label: string, real: boolean): void {
    if (real && this.countdownKind === 'next') console.log(`[ROUND] Countdown ${label}`)
    if (label === 'FIGHT' || label === 'BATTLE') {
      this.sound.playBattleStart()
      if (real && this.music !== 'normal') {
        this.music = 'boot'
        this.setMusic('normal')
      }
      return
    }
    if (label === 'NEXT') return
    this.sound.play('countdown', label === '1' ? 0.95 : 0.3)
  }

  private setMusic(level: MusicLevel): void {
    if (this.music === level) return
    this.music = level
    this.sound.setIntensity(level)
  }

  private launch(command: Omit<AttackCommand, 'id'>, delayMs = 0): void {
    if (!this.combatOpen) return
    const enemy = otherTeam(command.team)
    const foe = this.aim(command.team)
    const origin = this.onSide(command.team, command.fromX)
      ? { x: this.sideX(command.team, command.fromX), y: command.fromY }
      : this.launcher(command.team)
    const marked = command.targetId ? this.players.bodies.get(command.targetId) : undefined
    const markedEnemy = marked && marked.team === enemy && marked.dying <= 0
    const likeJitter = command.giftName === 'Like' ? ((((delayMs / 16) | 0) % 9) - 4) * 0.0025 : 0
    const full = this.attacks.enqueue(
      {
        ...command,
        fromX: this.sideX(command.team, origin.x),
        fromY: origin.y,
        roundToken: this.combatRound,
        toX: markedEnemy ? this.sideX(enemy, marked.x) : foe.x,
        toY: (markedEnemy ? marked.y : foe.y) + likeJitter,
        targetId: markedEnemy ? marked.id : foe.id,
      },
      delayMs,
    )
    this.seenAttacks.add(full.id)
    if (this.role === 'lead') postBattle({ type: 'attack', command: full, delayMs })
  }

  private relay(command: SyncCommand): boolean {
    if (this.role === 'lead') return false
    postBattle({ type: 'command', command })
    return true
  }

  private setRole(role: 'lead' | 'follow'): void {
    if (this.role === role) return
    this.role = role
    for (const listener of this.roleListeners) listener()
  }

  private considerRole(dt: number): void {
    this.roleAccum += dt
    this.saveAccum += dt
    if (this.roleAccum < 0.25) return
    this.roleAccum = 0
    const lock = readLock()
    const fresh = !!lock && Date.now() - lock.at < LOCK_TTL_MS
    if (this.role === 'lead') {
      if (fresh && lock.id !== this.windowId) {
        this.setRole('follow')
        return
      }
      claimLock(this.windowId)
      if (this.saveAccum >= 0.25) {
        this.saveAccum = 0
        this.writeSave(true)
      }
      return
    }
    if (!fresh || lock.id === this.windowId) {
      const save = readBattle()
      if (save) this.importSave(save, true)
      this.setRole('lead')
      claimLock(this.windowId)
    }
  }

  private onBattleMessage(message: { type: string }): void {
    if (message.type === 'state' && 'save' in message) {
      const save = message.save as BattleSave
      if (save.owner === this.windowId || save.revision <= this.appliedRevision) return
      if (this.role === 'lead' && save.revision < this.revision) return
      this.importSave(save, false)
      if (this.role === 'lead') this.setRole('follow')
      return
    }
    if (message.type === 'attack' && 'command' in message && this.role === 'follow') {
      const command = message.command as AttackCommand
      const delayMs = 'delayMs' in message && typeof message.delayMs === 'number' ? message.delayMs : 0
      if (this.battle.status !== 'running') return
      if (command.roundToken != null && command.roundToken !== this.combatRound) return
      if (this.seenAttacks.has(command.id)) return
      this.seenAttacks.add(command.id)
      this.attacks.adopt(command, delayMs)
      return
    }
    if (message.type === 'command' && this.role === 'lead' && 'command' in message) {
      this.runCommand(message.command as SyncCommand)
      return
    }
    if (message.type === 'event' && this.role === 'lead' && 'event' in message) {
      this.applyRemoteEvent(message.event as TikTokLiveEvent)
    }
  }

  private runCommand(command: SyncCommand): void {
    if (command.name === 'reset') this.reset()
    else if (command.name === 'stop') this.stopBattle()
    else if (command.name === 'pause') this.pause()
    else if (command.name === 'start') this.start()
    else if (command.name === 'mute') this.toggleMute()
    else if (command.name === 'preview') this.previewCountdown()
    else if (command.name === 'forever') this.runForever()
    else if (command.name === 'duration') this.setDuration(command.seconds)
    else if (command.name === 'jump') this.jumpTo(command.ms)
    else if (command.name === 'win') this.setWinCondition(command.condition)
    else if (command.name === 'assign') this.setTeamAssignMode(command.mode)
    else if (command.name === 'crowd') this.addRandom(command.count, command.team)
    else if (command.name === 'end') this.endRound(command.winner)
    else if (command.name === 'skipVictory') this.skipVictory()
    else if (command.name === 'resetRound') this.resetRound()
  }

  private applyRemoteEvent(event: TikTokLiveEvent): void {
    if (!acceptEvent(this.seenLiveEvents, event.payload.eventId)) return
    if (event.type === 'viewerJoined') this.handleJoin(event.payload.userId, event.payload.username, event.payload.avatarUrl, event.payload.team, event.payload.explicit === true)
    else if (event.type === 'viewerLeft') this.handleLeave(event.payload.userId, event.payload.username)
    else if (event.type === 'likeReceived') this.handleLike(event.payload.team, event.payload.count, event.payload.userId, event.payload.username, event.payload.avatarUrl)
    else if (event.type === 'followReceived') this.handleFollow(event.payload.username, event.payload.team, event.payload.userId, event.payload.avatarUrl)
    else if (event.type === 'shareReceived') this.handleShare(event.payload.username, event.payload.team, event.payload.userId, event.payload.avatarUrl)
    else if (event.type === 'commentReceived') this.handleComment(event.payload.userId, event.payload.username, event.payload.avatarUrl)
    else if (event.type === 'giftReceived') this.handleGift(event.payload)
  }

  private importSave(save: BattleSave, catchUp: boolean): void {
    const gap = catchUp ? Math.max(0, Date.now() - save.savedAt) : 0
    this.battle.apply(save.core, gap)
    this.players.hydrate(save.players, save.bodies)
    this.roundId = save.roundId
    this.roundStartedAt = save.roundStartedAt
    this.nextRoundWall = save.nextRoundWall
    this.activatedRound = save.activatedRound
    this.countdownView = save.countdown
    this.countdownToken = save.countdown?.token ?? ''
    this.teamAssignMode = save.teamAssignMode
    this.epoch = save.epoch
    this.feed = save.feed
    this.callouts = save.callouts
    this.announcement = save.announcement
    this.momentum.rush = save.rush
    this.combos.restore(Array.isArray(save.combos) ? save.combos : [], performance.now())
    this.momentum.restore(save.momentum, performance.now())
    this.roundNumber = typeof save.roundNumber === 'number' && save.roundNumber > 0 ? Math.floor(save.roundNumber) : 1
    this.countdownKind = save.countdownKind === 'next' ? 'next' : 'opening'
    this.roster.clear()
    for (const member of save.roster ?? []) {
      if (!member || typeof member.id !== 'string' || (member.team !== 'red' && member.team !== 'blue')) continue
      this.roster.set(member.id, member)
    }
    for (const player of save.players) this.rememberMember(player.id)
    this.chosenTeams.clear()
    const choices = save.choices ?? []
    if (choices.length > 0) {
      for (const choice of choices) {
        if (!choice || typeof choice.key !== 'string' || (choice.team !== 'red' && choice.team !== 'blue')) continue
        this.chosenTeams.set(choice.key, choice.team)
      }
    } else {
      for (const player of save.players) {
        if (/^p\d+$/.test(player.id)) continue
        this.rememberTeam(player.id, player.username, player.team)
      }
    }
    if (save.muted !== this.sound.muted) this.sound.toggle()
    this.appliedRevision = save.revision
    this.revision = Math.max(this.revision, save.revision)
    if (this.battle.status === 'running') this.activatedRound = this.roundId
    if (typeof save.combatRound === 'number' && save.combatRound > 0) this.combatRound = Math.floor(save.combatRound)
    if (this.battle.status !== 'running') this.attacks.reset()
    this.combatSealed = this.battle.status === 'victory' || this.battle.status === 'resetting'
    this.retireGuardians()
    this.publish()
  }

  private writeSave(broadcast: boolean): void {
    this.revision += 1
    const save: BattleSave = {
      revision: this.revision,
      savedAt: Date.now(),
      owner: this.windowId,
      core: this.battle.capture(),
      roundId: this.roundId,
      roundStartedAt: this.roundStartedAt,
      nextRoundWall: this.nextRoundWall,
      activatedRound: this.activatedRound,
      countdown: this.countdownView,
      teamAssignMode: this.teamAssignMode,
      epoch: this.epoch,
      muted: this.sound.muted,
      players: [...this.players.players.values()],
      bodies: [...this.players.bodies.values()],
      feed: this.feed,
      callouts: this.callouts,
      announcement: this.announcement,
      rush: this.momentum.rush,
      combos: this.combos.capture(performance.now()),
      momentum: this.momentum.capture(performance.now()),
      roundNumber: this.roundNumber,
      combatRound: this.combatRound,
      countdownKind: this.countdownKind,
      roster: [...this.roster.values()],
      choices: [...this.chosenTeams.entries()].map(([key, team]) => ({ key, team })),
    }
    this.appliedRevision = save.revision
    writeBattle(save, broadcast)
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
      powerFlash: this.powerFlash ? { ...this.powerFlash } : null,
      rush: this.momentum.rush ? { ...this.momentum.rush } : null,
      leaderboard: this.players.leaderboard(5),
      victory: this.battle.status === 'victory' ? this.battle.victory : null,
      victoryMs: this.battle.victoryElapsed,
      round: this.roundNumber,
      muted: this.sound.muted,
      selected: this.selectedId ? this.players.toEntry(this.selectedId) : null,
      winCondition: this.battle.winCondition,
      teamAssignMode: this.teamAssignMode,
      finalTen: this.battle.finalTen,
      countdown: this.countdownView ? { ...this.countdownView } : null,
      epoch: this.epoch,
      attract: this.attract.mode === 'full' || this.attract.mode === 'reduced' || this.attract.mode === 'waiting',
    }
  }

  private stepAttract(dt: number, now: number, launch: boolean): void {
    this.retireGuardians()
    const counts = realTeamCounts(this.players.players.values(), (id) => {
      const body = this.players.bodies.get(id)
      return !!body && body.hp > 0 && body.dying <= 0
    })
    const fire = this.attract.step(now, counts)
    let posing = false
    for (const body of this.players.bodies.values()) {
      if (body.poseMode > 0) {
        posing = true
        break
      }
    }
    this.attract.ease(dt, posing)
    if (launch && fire && this.combatOpen && !AUTO_BATTLE_CONFIG.enabled) this.fireNpc(fire)
  }

  private stepAutoBattle(now: number): void {
    const actions = this.autoBattle.step(now, {
      running: this.battle.status === 'running',
      round: this.combatRound,
      busy: this.announcement != null || this.powerFlashLeft > 0.05 || this.attacks.winding || this.cinemaLive,
      alive: (team) => this.livingDummies(team),
    })
    for (const action of actions) this.applyAutoAction(action)
  }

  private livingDummies(team: TeamId): string[] {
    const ids: string[] = []
    for (const player of this.players.players.values()) {
      if (player.team !== team || !isFieldDummy(player)) continue
      const body = this.players.bodies.get(player.id)
      if (!body || body.hp <= 0 || body.dying > 0 || body.shown === 0) continue
      ids.push(player.id)
    }
    return ids
  }

  private applyAutoAction(action: AutoAction): void {
    if (action.type === 'cancel') {
      this.releaseAutoPose(action.actorId)
      return
    }
    if (action.type === 'charge') {
      this.beginAutoCharge(action.actorId)
      return
    }
    if (action.type === 'basic') this.fireAutoBasic(action.team, action.actorId)
    else this.fireAutoBig(action.team, action.actorId, action.attackId)
  }

  private beginAutoCharge(id: string): void {
    const peak = AUTO_BATTLE_CONFIG.bigScale
    this.players.cast(id, peak, 0, false)
    const body = this.players.bodies.get(id)
    if (!body) return
    body.poseHold = (AUTO_BATTLE_CONFIG.bigChargeMs + 280) / 1000
    body.posePeak = peak
    this.players.swell(id, 0.62, body.poseHold)
  }

  private releaseAutoPose(id: string): void {
    const body = this.players.bodies.get(id)
    if (!body) return
    body.poseHold = 0
    body.surgeHold = 0
    if (body.poseMode > 0) {
      body.poseMode = 3
      body.poseClock = 0
    }
  }

  private fireAutoBasic(team: TeamId, id: string): void {
    const body = this.players.bodies.get(id)
    const player = this.players.players.get(id)
    if (!body || !player || !isFieldDummy(player)) return
    this.players.cast(id, AUTO_BATTLE_CONFIG.basicScale, 0, false)
    const foe = this.players.livingPoint(otherTeam(team))
    this.launch({
      attackType: 'energy_bullet',
      team,
      fromX: body.x,
      fromY: body.y,
      toX: foe?.x ?? (team === 'red' ? 0.76 : 0.24),
      toY: foe?.y ?? body.y,
      targetId: foe?.id,
      intensity: 0.55,
      duration: 0.92,
      damage: ambientAttackDamage(0, 'basic'),
      shake: 'none',
      particleIntensity: 0.32,
      sound: 'projectile',
      priority: 1,
      username: player.username,
      giftName: 'TikTok',
      combo: 1,
      rarity: 'micro',
      impacts: attackImpacts.energy_bullet,
      ambient: true,
    }, AUTO_BATTLE_CONFIG.basicWindupMs)
    autoLog(`[AUTO] ${team === 'red' ? 'Canada' : 'USA'} basic attack`)
  }

  private fireAutoBig(team: TeamId, id: string, attackId: string): void {
    const spec = bigAutoAttackById(attackId)
    const body = this.players.bodies.get(id)
    const player = this.players.players.get(id)
    if (!spec || !body || !player || !isFieldDummy(player)) return
    const foe = this.players.livingPoint(otherTeam(team))
    this.launch({
      attackType: spec.attackType,
      team,
      fromX: body.x,
      fromY: body.y,
      toX: foe?.x ?? (team === 'red' ? 0.76 : 0.24),
      toY: foe?.y ?? body.y,
      targetId: foe?.id,
      intensity: spec.intensity,
      duration: spec.duration,
      damage: ambientAttackDamage(spec.baseDamage, 'big'),
      shake: spec.shake,
      particleIntensity: spec.particleIntensity,
      sound: spec.sound,
      priority: 2,
      username: player.username,
      giftName: spec.giftName,
      combo: 1,
      rarity: spec.rarity,
      impacts: spec.impacts,
      ambient: true,
    })
    autoLog(`[AUTO BIG] ${team === 'red' ? 'Canada' : 'USA'} / ${spec.id} / ${id}`)
  }

  private retireGuardians(): void {
    for (const id of [attractModePlayers.canada.id, attractModePlayers.usa.id]) {
      if (this.players.players.has(id)) this.players.remove(id)
    }
  }

  private dummyActor(team: TeamId): { id: string; username: string; x: number; y: number } | null {
    const dummies = [...this.players.players.values()].filter((player) => player.team === team && /^p\d+$/.test(player.id))
    if (dummies.length === 0) return null
    const start = this.npcCursor[team] % dummies.length
    this.npcCursor[team] = start + 1
    for (let step = 0; step < dummies.length; step += 1) {
      const player = dummies[(start + step) % dummies.length]
      if (!player) continue
      const body = this.players.bodies.get(player.id)
      if (!body || body.dying > 0 || body.hp <= 0 || body.shown === 0) continue
      return { id: player.id, username: player.username, x: body.x, y: body.y }
    }
    return null
  }

  private fireNpc(team: TeamId): void {
    const actor = this.dummyActor(team)
    if (!actor) return
    const kind = team === 'red' ? 'maple' : 'star'
    this.players.cast(actor.id, 1.12, 0, false)
    const enemy = otherTeam(team)
    const foe = this.players.livingPoint(enemy)
    const target = enemy === 'red' ? this.battle.red : this.battle.blue
    const damage = allowedNpcDamage(attractModeConfig.damagePerAttack, this.attract.damageDealt, target.health, target.maxHealth)
    this.launch({
      attackType: 'energy_bullet',
      team,
      fromX: actor.x,
      fromY: actor.y,
      toX: 0,
      toY: 0,
      intensity: 0.25 * attractModeConfig.visualIntensity,
      duration: 0.95,
      damage,
      shake: 'none',
      particleIntensity: 0.2 * attractModeConfig.visualIntensity,
      sound: 'projectile',
      priority: 1,
      username: actor.username,
      giftName: 'Spark',
      combo: 1,
      rarity: 'micro',
      impacts: [0.82],
      targetId: foe?.id,
      npcKind: kind,
    })
  }
}

function countdownStep(elapsed: number): { label: string; level: number } | null {
  if (elapsed >= COUNT_MS + FIGHT_MS) return null
  if (elapsed >= COUNT_MS) return { label: 'FIGHT', level: 6 }
  const index = Math.min(4, Math.max(0, Math.floor(elapsed / 1000)))
  return { label: String(5 - index), level: index + 1 }
}

function teamLabel(team: TeamId): 'CANADA' | 'USA' {
  return team === 'red' ? 'CANADA' : 'USA'
}

function teamFlag(team: TeamId): string {
  return team === 'red' ? '🇨🇦' : '🇺🇸'
}

const COMMENT_FX: AttackType[] = ['sparkle_shot', 'heart', 'rose', 'ice', 'magic', 'energy_bullet']

function flightSeconds(rarity: GiftRarity, attackType: AttackType): number {
  if (attackType === 'black_hole') return 0.95
  if (attackType === 'meteor' || attackType === 'dragon') return 0.86
  if (attackType === 'firestorm' || attackType === 'thunderstorm' || attackType === 'laser' || attackType === 'sword' || attackType === 'tornado') return 0.76
  if (attackType === 'cosmic' || attackType === 'airstrike' || attackType === 'lightning' || attackType === 'fire_blast') return 0.68
  if (rarity === 'large') return 0.6
  if (rarity === 'medium') return 0.48
  if (rarity === 'small') return 0.68
  return 0.66
}

function hitPointEach(command: { damage: number; impacts: number[]; ambient?: boolean }, people: number): number {
  const portion = Math.max(0, command.damage) / Math.max(1, command.impacts.length)
  const share = Math.round(portion / Math.max(1, people))
  if (command.ambient) return Math.max(1, share)
  return Math.max(3, share)
}

function avatarHit(command: AttackCommand): number {
  if (command.attackType === 'follow_blast') return battleConfig.followHit
  if (command.attackType === 'share_shot') return battleConfig.shareHit
  if (command.giftName === 'Like') return 4
  if (command.giftName === 'Comment') return 10
  if (command.rarity === 'legendary' || command.rarity === 'large') return battleConfig.playerHealth
  if (command.rarity === 'medium') return 55
  if (command.rarity === 'small') return 30
  return 16
}

function scaledDamage(base: number, count: number, combo: number): number {
  const stack = count <= 1 ? 1 : 1 + Math.log2(count) * 0.9
  const comboMul = 1 + (comboIntensity(combo) - 1) * 0.55
  return Math.max(1, Math.round(base * stack * comboMul))
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
