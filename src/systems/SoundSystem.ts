import { clearProducer, createAudioGraph, releaseStream } from '../audio/AudioManager.ts'
import { AttackSoundController } from '../audio/AttackSoundController.ts'
import { backgroundMusicConfig, countdownVolume, victoryDuckVolume } from '../audio/audioConfig.ts'
import { BackgroundMusic, musicSceneFor } from '../audio/MusicController.ts'
import type { AttackCommand, BattleStatus, TimerPhase } from '../types/Battle.ts'
import type { GiftRarity, SoundEffectId } from '../types/Gift.ts'
import type { TeamId } from '../types/Team.ts'
import { attackLab } from '../game/attacks/lab.ts'
import { cinemaOf } from '../game/attacks/cinema.ts'
import { styleOf, type AttackStyle } from '../game/attacks/style.ts'

type Intensity = 'normal' | 'rush' | 'final' | 'victory'
type MusicId = 'battle-main' | 'final-rush' | 'victory'

export type SfxName =
  | 'gift-small'
  | 'gift-medium'
  | 'gift-large'
  | 'atk-like'
  | 'atk-follow'
  | 'atk-share'
  | 'atk-small'
  | 'atk-medium'
  | 'atk-big'
  | 'hit-small'
  | 'hit-medium'
  | 'hit-large'
  | 'projectile'
  | 'laser'
  | 'missile-launch'
  | 'missile-flight'
  | 'missile-impact'
  | 'power-charge'
  | 'power-release'
  | 'explosion-small'
  | 'explosion-large'
  | 'lightning'
  | 'fire'
  | 'tornado'
  | 'meteor-fall'
  | 'meteor-impact'
  | 'ultimate-charge'
  | 'ultimate-impact'
  | 'combo'
  | 'combo-high'
  | 'momentum'
  | 'team-lead'
  | 'countdown-tick'
  | 'countdown-final'
  | 'final-rush-start'
  | 'battle-start'
  | 'victory'

interface PendingMusic {
  id: MusicId
  loop: boolean
  force: boolean
  sting: boolean
}

interface Voice {
  key: string
  priority: number
  started: number
  source: AudioBufferSourceNode
  gain: GainNode
}

const MAX_VOICES = 6
const MUSIC_FADE = 1.15

const MUSIC_URL: Record<MusicId, string> = {
  'battle-main': '/audio/music/battle-main.wav',
  'final-rush': '/audio/music/final-rush.wav',
  victory: '/audio/music/victory.wav',
}

const LAYER_URL = {
  'close-tension': '/audio/music/close-tension.wav',
  'final-ten': '/audio/music/final-ten.wav',
  comeback: '/audio/music/comeback.wav',
  'lead-hit': '/audio/music/lead-hit.wav',
  'final-three': '/audio/music/final-three.wav',
} as const

type CueName = 'comeback' | 'lead-hit' | 'final-three'
type LoopName = 'close-tension' | 'final-ten'

interface EffectCue {
  file: SfxName
  priority: number
  cooldown: number
  voices: number
  high?: SfxName
  highAt?: number
}

const EFFECTS: Record<SoundEffectId, EffectCue> = {
  small_hit: { file: 'gift-small', priority: 1, cooldown: 0.14, voices: 2 },
  projectile: { file: 'projectile', priority: 2, cooldown: 0.1, voices: 3 },
  magic: { file: 'projectile', priority: 2, cooldown: 0.12, voices: 2 },
  rocket: { file: 'missile-impact', priority: 3, cooldown: 0.28, voices: 2 },
  explosion: { file: 'explosion-small', priority: 3, cooldown: 0.22, voices: 2 },
  fire: { file: 'fire', priority: 4, cooldown: 0.28, voices: 2 },
  electricity: { file: 'lightning', priority: 4, cooldown: 0.3, voices: 2 },
  tornado: { file: 'tornado', priority: 4, cooldown: 0.7, voices: 1 },
  meteor: { file: 'meteor-impact', priority: 5, cooldown: 0.8, voices: 1 },
  combo: { file: 'combo', priority: 3, cooldown: 0.18, voices: 1, high: 'combo-high', highAt: 0.2 },
  countdown: { file: 'countdown-tick', priority: 3, cooldown: 0.2, voices: 1, high: 'countdown-final', highAt: 0.8 },
  victory: { file: 'victory', priority: 5, cooldown: 1.5, voices: 1 },
  whoosh: { file: 'power-release', priority: 2, cooldown: 0.4, voices: 1 },
}

/**
 * File-backed mixer for Aurora.
 * Assets are original WAVs rendered by scripts/render-audio.mjs.
 * A missing file is logged once and skipped. It never throws into the battle loop.
 */
export class SoundManager {
  muted = false
  masterVolume = 1
  musicVolume = 0.09
  sfxVolume = 0.52
  lastError = ''

  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private duckGain: GainNode | null = null
  private bedGain: GainNode | null = null
  private musicSource: AudioBufferSourceNode | null = null
  private musicId: MusicId | null = null
  private musicIntent: MusicId | null = null
  private musicToken = 0
  private unlocked = false
  private pending: PendingMusic | null = null
  private duckUntil = 0
  private leadTeam: TeamId | null = null
  private leadUntil = 0
  private peakGap = 0
  private peakLeader: TeamId | null = null
  private comebackUntil = 0
  private tensionOn = false
  private clockStage: 'off' | 'ten' | 'three' = 'off'
  private finalTarget = 0
  private holdUntil = 0
  private layersLive = backgroundMusicConfig.enabled
  private layerToken = 0
  private cueToken = 0
  private tensionGain: GainNode | null = null
  private tensionSource: AudioBufferSourceNode | null = null
  private finalGain: GainNode | null = null
  private finalSource: AudioBufferSourceNode | null = null
  private readonly cues: AudioBufferSourceNode[] = []
  private readonly cache = new Map<string, AudioBuffer>()
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>()
  private readonly failed = new Set<string>()
  private readonly lastAt = new Map<string, number>()
  private voices: Voice[] = []
  private attackVoices: Voice[] = []
  private readonly attackLast = new Map<string, number>()
  readonly background = new BackgroundMusic()
  private readonly ducks = new AttackSoundController(this.background)
  private page: 'battle' | 'admin' | 'none' = 'none'
  private sceneHoldUntil = 0
  private bedSuppressed = false
  private battleWake: number | null = null

  constructor() {
    this.background.setAudibleListener(() => this.adoptTrack())
    if (typeof window === 'undefined') return
    const unlock = () => {
      this.unlock()
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('pointerup', unlock, true)
    window.addEventListener('keydown', unlock, true)
    window.addEventListener('touchstart', unlock, true)
  }

  unlock(): void {
    if (this.unlocked && this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
      this.background.markUnlocked()
      return
    }
    this.unlocked = true
    if (!this.ensure()) return
    this.preload()
    void this.finishUnlock()
  }

  get audioUnlocked(): boolean {
    return this.unlocked
  }

  /** The battle window has no admin clicks, so keep asking the browser to open audio. */
  private wakeBattleAudio(): void {
    if (typeof window === 'undefined' || this.page !== 'battle') return
    if (!this.unlocked || !this.ctx) this.unlock()
    const ctx = this.ctx
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined)
    if (ctx?.state === 'running') {
      this.stopBattleWake()
      return
    }
    if (this.battleWake != null) return
    let tries = 0
    this.battleWake = window.setInterval(() => {
      if (this.page !== 'battle') {
        this.stopBattleWake()
        return
      }
      if (!this.unlocked || !this.ctx) this.unlock()
      const audio = this.ctx
      if (audio?.state === 'suspended') void audio.resume().catch(() => undefined)
      tries += 1
      if (audio?.state === 'running' || tries > 80) this.stopBattleWake()
    }, 400)
  }

  private stopBattleWake(): void {
    if (this.battleWake == null || typeof window === 'undefined') {
      this.battleWake = null
      return
    }
    window.clearInterval(this.battleWake)
    this.battleWake = null
  }

  enterBattle(): void {
    this.page = 'battle'
    this.background.setRoute('battle')
    this.background.clearUserPause()
    void this.background.prepare()
    this.unlock()
    this.background.markUnlocked()
    this.wakeBattleAudio()
  }

  leaveBattle(): void {
    this.page = 'none'
    this.stopBattleWake()
    this.background.setRoute('none')
    this.ducks.cancel()
    this.background.stop()
  }

  enterAdmin(): void {
    this.page = 'admin'
    this.background.setRoute('admin')
    void this.background.prepare()
  }

  leaveAdmin(): void {
    this.page = 'none'
    this.background.setRoute('none')
    this.ducks.cancel()
    this.background.pause()
    this.background.releaseCustom()
    releaseStream()
    clearProducer()
  }

  followBattle(status: BattleStatus, phase: TimerPhase, timeLeftMs: number, endless: boolean): void {
    const scene = musicSceneFor(status, phase, timeLeftMs, endless)
    if (this.page === 'admin') {
      const status = this.background.status()
      if (!status.foreignOwner) this.background.clearBlocked()
      if (this.background.isPlaying() && status.foreignOwner) this.background.pause()
      if (performance.now() < this.sceneHoldUntil) return
      if (this.background.isPlaying()) this.background.applyScene(scene)
      return
    }
    if (this.page !== 'battle') return
    this.wakeBattleAudio()
    if (!this.unlocked || !this.background.isEnabled()) return
    if (this.background.hasAudio()) this.adoptTrack()
    if (performance.now() < this.sceneHoldUntil) return
    void this.background.play()
    if (this.background.isPlaying()) this.background.applyScene(scene)
  }

  testBackground(mode: 'battle' | 'final30' | 'final10' | 'victory' | 'legendary'): void {
    this.unlock()
    this.sceneHoldUntil = performance.now() + (mode === 'final30' ? 7000 : 5000)
    this.background.armExplicit()
    void this.background.play().then(() => {
      if (!this.background.isPlaying() && mode !== 'legendary') return
      const fade = backgroundMusicConfig.fadeDurationMs / 1000
      if (mode === 'battle') this.background.preview(backgroundMusicConfig.battleVolume, false, fade)
      else if (mode === 'final30') this.background.preview(backgroundMusicConfig.finalThirtySecondsVolume, false, 1.6)
      else if (mode === 'final10') this.background.preview(backgroundMusicConfig.finalThirtySecondsVolume, true, fade)
      else if (mode === 'victory') {
        this.background.preview(victoryDuckVolume, false, 0.35)
        this.previewSfx('victory')
      } else {
        this.ducks.cue('eclipse')
        this.previewSfx('ultimate-impact')
      }
    })
  }

  mute(): void {
    this.muted = true
    this.applyMaster()
  }

  unmute(): void {
    this.muted = false
    this.unlock()
    this.applyMaster()
  }

  toggle(): boolean {
    if (this.muted) this.unmute()
    else this.mute()
    return this.muted
  }

  setMasterVolume(value: number): void {
    this.masterVolume = clamp01(value)
    this.applyMaster()
  }

  setMusicVolume(value: number): void {
    this.musicVolume = clamp01(value)
    this.setGain(this.musicGain, this.musicVolume)
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = clamp01(value)
    this.setGain(this.sfxGain, this.sfxVolume)
  }

  setIntensity(level: Intensity): void {
    if (level === 'normal') this.playBattleMusic()
    else if (level === 'rush') this.playFinalRushMusic()
    else if (level === 'final') this.playFinalRushMusic()
    else this.playVictoryMusic()
  }

  playBattleMusic(force = false): void {
    this.layersLive = true
    this.queueMusic('battle-main', true, force, false)
  }

  playFinalRushMusic(force = false): void {
    this.layersLive = true
    this.queueMusic('final-rush', true, force, true)
  }

  playVictoryMusic(): void {
    this.clearMatchLayers()
    this.queueMusic('victory', false, true, false)
  }

  stopMusic(): void {
    this.musicToken += 1
    this.pending = null
    this.musicId = null
    this.musicIntent = null
    this.fadeMusicOut()
  }

  stopAll(): void {
    this.ducks.cancel()
    this.background.stop()
    this.musicToken += 1
    this.pending = null
    this.musicId = null
    this.musicIntent = null
    this.stopMusicNode()
    this.stopVoices()
    this.layersLive = false
    this.clearMatchLayers()
    if (this.duckGain && this.ctx) {
      const now = this.ctx.currentTime
      this.duckGain.gain.cancelScheduledValues(now)
      this.duckGain.gain.setValueAtTime(1, now)
    }
    this.duckUntil = 0
  }

  resetForBattle(): void {
    this.leadTeam = null
    this.leadUntil = 0
    this.peakGap = 0
    this.peakLeader = null
    this.comebackUntil = 0
    this.tensionOn = false
    this.clockStage = 'off'
    this.finalTarget = 0
    this.holdUntil = 0
    this.stopVoices()
    this.clearMatchLayers()
    if (this.duckGain && this.ctx) {
      const now = this.ctx.currentTime
      this.duckGain.gain.cancelScheduledValues(now)
      this.duckGain.gain.setValueAtTime(1, now)
    }
    this.duckUntil = 0
    if (this.background.hasAudio()) {
      this.adoptTrack()
      return
    }
    this.playBattleMusic(true)
  }

  play(id: SoundEffectId, amount = 1, team?: TeamId): void {
    const cue = EFFECTS[id]
    const lifted = cue.high && amount >= (cue.highAt ?? 1) ? cue.high : cue.file
    const priority = lifted === 'combo-high' || lifted === 'countdown-final' ? Math.max(4, cue.priority) : cue.priority
    this.playNamed(lifted, priority, cue.cooldown, cue.voices, team, 0, amount)
  }

  previewSfx(name: SfxName): void {
    this.unlock()
    this.playNamed(name, 5, 0.05, 3, undefined, 0, 1)
  }

  playBattleStart(): void {
    this.playNamed('battle-start', 5, 0.4, 1)
  }

  silenceForCountdown(): void {
    this.layersLive = false
    this.leadTeam = null
    this.leadUntil = 0
    this.peakGap = 0
    this.peakLeader = null
    this.comebackUntil = 0
    this.tensionOn = false
    this.clockStage = 'off'
    this.finalTarget = 0
    this.holdUntil = 0
    this.clearMatchLayers()
    this.stopVoices()
    if (this.background.hasAudio()) {
      this.adoptTrack()
      this.background.fadeTo(countdownVolume, backgroundMusicConfig.fadeDurationMs / 1000)
      return
    }
    this.stopMusic()
  }

  cueGift(rarity: GiftRarity, _team: TeamId): void {
    if (rarity === 'legendary' || rarity === 'large') return
    if (rarity === 'medium') return
    if (rarity === 'small' || rarity === 'micro') return
  }

  cueUltimateCharge(team: TeamId): void {
    this.playNamed('ultimate-charge', 5, 0.8, 1, team)
    this.duck(2.4)
  }

  cueMomentum(team: TeamId): void {
    this.playNamed('momentum', 3, 4, 1, team)
  }

  observeLead(red: number, blue: number): void {
    const total = red + blue
    const margin = Math.abs(red - blue)
    if (total < 80 || margin < Math.max(40, total * 0.08)) return
    const leader: TeamId = red > blue ? 'red' : 'blue'
    if (leader === this.leadTeam) return
    const now = this.ctx?.currentTime ?? performance.now() / 1000
    if (now < this.leadUntil) return
    this.leadTeam = leader
    this.leadUntil = now + 12
    this.peakLeader = leader
    this.peakGap = margin
    this.playMusicCue('lead-hit')
  }

  /**
   * Reacts to the score and the clock without restarting the bed.
   * Close games add a tension loop. A real gap closing plays one riser.
   * The last ten seconds raise a percussion layer, and the last three add a riser.
   */
  observeMatch(red: number, blue: number, phase: TimerPhase, second: number | null): void {
    if (!this.layersLive) return
    const now = this.ctx?.currentTime ?? performance.now() / 1000
    if (now < this.holdUntil) return
    const total = red + blue
    const gap = Math.abs(red - blue)
    const leader: TeamId = red >= blue ? 'red' : 'blue'
    const close = phase === 'normal' && total >= 140 && gap <= Math.max(36, total * 0.11)
    this.setClose(close)
    if (gap > this.peakGap + 8) {
      this.peakGap = gap
      this.peakLeader = leader
    }
    const stillBehind = this.peakLeader === leader
    const closedFarEnough = this.peakGap >= 90 && gap + 40 <= this.peakGap && gap <= this.peakGap * 0.55
    if (stillBehind && closedFarEnough && phase !== 'final_10' && now >= this.comebackUntil) {
      this.comebackUntil = now + 10
      this.peakGap = gap
      this.playMusicCue('comeback')
    }
    this.followClock(phase, second)
  }

  previewClose(): void {
    this.unlock()
    this.hold(6)
    this.setClose(true)
  }

  previewComeback(): void {
    this.unlock()
    this.hold(3)
    this.playMusicCue('comeback', true)
  }

  previewLeadHit(): void {
    this.unlock()
    this.hold(2)
    this.playMusicCue('lead-hit', true)
  }

  previewFinal(stage: 'ten' | 'three'): void {
    this.unlock()
    this.hold(stage === 'three' ? 4 : 6)
    this.clockStage = 'off'
    this.followClock('final_10', stage === 'three' ? 3 : 8)
  }

  private hold(seconds: number): void {
    const now = this.ctx?.currentTime ?? 0
    this.holdUntil = now + seconds
  }

  private setClose(on: boolean): void {
    if (on === this.tensionOn) return
    this.tensionOn = on
    void this.ensureLoop('close-tension').then((gain) => {
      if (!gain || this.tensionOn !== on) return
      this.ramp(gain, on ? 0.18 : 0)
    })
  }

  private followClock(phase: TimerPhase, second: number | null): void {
    if (phase !== 'final_10' || second == null || second > 10 || second < 1) {
      if (this.clockStage !== 'off') {
        this.clockStage = 'off'
        this.finalTarget = 0
        if (this.finalGain) this.ramp(this.finalGain, 0)
      }
      return
    }
    const stage = second <= 3 ? 'three' : 'ten'
    const target = second <= 3 ? 0.32 : 0.1 + (10 - second) * 0.018
    if (this.clockStage === stage && Math.abs(this.finalTarget - target) < 0.03) return
    const enteredThree = stage === 'three' && this.clockStage !== 'three'
    this.clockStage = stage
    this.finalTarget = target
    void this.ensureLoop('final-ten').then((gain) => {
      if (gain && this.clockStage === stage) this.ramp(gain, this.finalTarget)
    })
    if (enteredThree) this.playMusicCue('final-three')
  }

  private playMusicCue(name: CueName, force = false): void {
    if (!force && !this.layersLive) return
    const ctx = this.ensure()
    if (!ctx || !this.duckGain) return
    const now = ctx.currentTime
    if (!force) {
      const last = this.lastAt.get(name) ?? -10
      if (now - last < 1.2) return
    }
    this.lastAt.set(name, now)
    const token = this.cueToken
    const bus = this.duckGain
    void this.load(LAYER_URL[name]).then((buffer) => {
      if (!buffer || token !== this.cueToken || !this.ctx || !this.duckGain || this.muted || this.duckGain !== bus) return
      const source = this.ctx.createBufferSource()
      const gain = this.ctx.createGain()
      source.buffer = buffer
      gain.gain.value = name === 'final-three' ? 0.28 : 0.32
      source.connect(gain)
      gain.connect(this.duckGain)
      this.cues.push(source)
      source.onended = () => {
        const index = this.cues.indexOf(source)
        if (index >= 0) this.cues.splice(index, 1)
        try {
          source.disconnect()
          gain.disconnect()
        } catch {
          // The cue was already stopped.
        }
      }
      try {
        source.start()
      } catch (error) {
        this.noteError(name, error)
      }
    })
  }

  private async ensureLoop(name: LoopName): Promise<GainNode | null> {
    const ready = name === 'close-tension' ? this.tensionGain : this.finalGain
    if (ready && (name === 'close-tension' ? this.tensionSource : this.finalSource)) return ready
    const ctx = this.ensure()
    if (!ctx || !this.duckGain) return null
    const token = this.layerToken
    const buffer = await this.load(LAYER_URL[name])
    if (!buffer || token !== this.layerToken || !this.ctx || !this.duckGain) return null
    if (name === 'close-tension' ? this.tensionSource : this.finalSource) {
      return name === 'close-tension' ? this.tensionGain : this.finalGain
    }
    const source = this.ctx.createBufferSource()
    const gain = this.ctx.createGain()
    source.buffer = buffer
    source.loop = true
    gain.gain.value = 0.0001
    source.connect(gain)
    gain.connect(this.duckGain)
    try {
      source.start()
    } catch (error) {
      this.noteError(name, error)
      return null
    }
    if (name === 'close-tension') {
      this.tensionSource = source
      this.tensionGain = gain
    } else {
      this.finalSource = source
      this.finalGain = gain
    }
    return gain
  }

  private ramp(gain: GainNode, target: number): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now)
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, target), now + 0.45)
  }

  private clearMatchLayers(): void {
    this.layerToken += 1
    this.cueToken += 1
    this.stopLayer(this.tensionSource, this.tensionGain)
    this.stopLayer(this.finalSource, this.finalGain)
    this.tensionSource = null
    this.tensionGain = null
    this.finalSource = null
    this.finalGain = null
    this.tensionOn = false
    this.clockStage = 'off'
    this.finalTarget = 0
    for (const cue of this.cues) {
      try {
        cue.stop()
      } catch {
        // Already stopped.
      }
    }
    this.cues.length = 0
  }

  private stopLayer(source: AudioBufferSourceNode | null, gain: GainNode | null): void {
    if (!source || !gain) return
    this.stopNode(source, gain)
  }

  onAttackStart(command: AttackCommand): void {
    if (command.npcKind) {
      this.playNpc(command.npcKind, 'cast', command.team)
      return
    }
    const scene = cinemaOf(command)
    if (scene) {
      this.playAttack('atk-big', attackLab.volume, 3, 0)
      this.duck(scene.scale >= 1.5 ? 1.1 : 0.7)
      return
    }
    this.playStyle(styleOf(command), 'cast', command.team)
  }

  playImpact(command: AttackCommand): void {
    if (command.npcKind) {
      this.playNpc(command.npcKind, 'hit', command.team)
      return
    }
    const scene = cinemaOf(command)
    if (scene) {
      this.playAttack('hit-large', 0.9 * attackLab.volume, 3, 0)
      return
    }
    this.playStyle(styleOf(command), 'hit', command.team)
  }

  playCinema(file: SfxName, amount: number, team?: TeamId): void {
    this.playNamed(file, 5, 0.08, 1, team, 0, amount * attackLab.volume)
  }

  private playNpc(kind: 'maple' | 'star', phase: 'cast' | 'hit', _team: TeamId): void {
    const real = phase === 'cast' ? 0.32 : 0.22
    const file: SfxName = phase === 'cast' ? (kind === 'maple' ? 'atk-follow' : 'atk-like') : 'hit-small'
    this.playAttack(file, real * 0.6 * attackLab.volume, 4, 0)
    if (phase === 'cast') this.ducks.cueSoft()
  }

  private playStyle(style: AttackStyle, phase: 'cast' | 'hit', _team: TeamId): void {
    const cue = phase === 'cast' ? CAST_CUE[style] : HIT_CUE[style]
    const gain = attackLab.volume * (attackLab.volumes[style] ?? 1)
    this.playAttack(cue.file, cue.amount * gain, cue.voices, cue.cooldown)
    if (phase === 'cast' && this.background.hasAudio()) this.ducks.cue(style)
    else if (phase === 'cast' && (style === 'eclipse' || style === 'planet' || style === 'crystal')) this.duck(style === 'eclipse' ? 0.45 : 0.8)
  }

  /** Overlapping attack voices. A new like never cuts off one that is still playing. */
  private playAttack(name: SfxName, amount: number, pool: number, cooldown: number): void {
    if (this.muted || !(amount > 0)) return
    if (this.page === 'battle') this.wakeBattleAudio()
    const ctx = this.ensure()
    if (!ctx || !this.sfxGain) return
    const url = `/audio/sfx/${name}.wav`
    const ready = this.cache.get(url)
    const begin = (buffer: AudioBuffer) => {
      const run = () => {
        if (ctx.state === 'running') {
          this.startAttack(buffer, name, amount, pool, cooldown)
          return
        }
        void ctx.resume().then(() => {
          if (ctx.state === 'running') this.startAttack(buffer, name, amount, pool, cooldown)
        }).catch(() => undefined)
      }
      run()
    }
    if (ready) {
      begin(ready)
      return
    }
    void this.load(url).then((buffer) => {
      if (!buffer || this.muted) return
      begin(buffer)
    })
  }

  private startAttack(buffer: AudioBuffer, key: string, amount: number, pool: number, cooldown: number): void {
    const ctx = this.ctx
    const bus = this.sfxGain
    if (!ctx || !bus) return
    const now = ctx.currentTime
    const last = this.attackLast.get(key) ?? -10
    if (cooldown > 0 && now - last < cooldown) return
    this.attackVoices = this.attackVoices.filter((voice) => voice.source.context.state !== 'closed')
    const same = this.attackVoices.filter((voice) => voice.key === key)
    if (same.length >= pool) return
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffer
    source.playbackRate.value = 0.97 + Math.random() * 0.06
    const spread = 0.98 + Math.random() * 0.04
    const level = Math.max(0, amount) * spread
    gain.gain.setValueAtTime(level, now)
    source.connect(gain)
    gain.connect(bus)
    const voice: Voice = { key, priority: 1, started: now, source, gain }
    this.attackVoices.push(voice)
    this.attackLast.set(key, now)
    source.onended = () => {
      const index = this.attackVoices.indexOf(voice)
      if (index >= 0) this.attackVoices.splice(index, 1)
      try {
        source.disconnect()
        gain.disconnect()
      } catch {
        // Already disconnected.
      }
    }
    try {
      source.start(now)
    } catch (error) {
      this.noteError(key, error)
    }
  }

  duck(seconds: number): void {
    const ctx = this.ctx
    const duck = this.duckGain
    if (!ctx || !duck) return
    const now = ctx.currentTime
    const hold = Math.max(this.duckUntil, now + seconds)
    this.duckUntil = hold
    const gain = duck.gain
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(Math.max(0.0001, gain.value), now)
    gain.linearRampToValueAtTime(0.35, now + 0.18)
    gain.setValueAtTime(0.35, hold)
    gain.linearRampToValueAtTime(1, hold + 0.6)
  }

  private queueMusic(id: MusicId, loop: boolean, force: boolean, sting: boolean): void {
    if (!this.background.isEnabled()) {
      this.layersLive = false
      this.stopMusic()
      return
    }
    if (this.background.hasAudio()) {
      this.adoptTrack()
      if (sting) this.playNamed('final-rush-start', 5, 0.5, 1)
      return
    }
    if (!this.unlocked || !this.ctx) {
      if (!force && this.pending?.id === id) return
      this.pending = { id, loop, force, sting }
      return
    }
    if (!force && (this.musicId === id || this.musicIntent === id)) return
    this.musicIntent = id
    if (sting) this.playNamed('final-rush-start', 5, 0.5, 1)
    void this.crossfadeTo(id, loop, force)
  }

  private flushPending(): void {
    const job = this.pending
    if (!job) return
    this.pending = null
    this.queueMusic(job.id, job.loop, job.force, job.sting)
  }

  private async crossfadeTo(id: MusicId, loop: boolean, force: boolean): Promise<void> {
    if (!force && this.musicId === id && this.musicSource) return
    const ctx = this.ensure()
    if (!ctx) return
    const token = ++this.musicToken
    const buffer = await this.load(MUSIC_URL[id])
    if (!buffer || token !== this.musicToken || !this.duckGain) {
      if (token === this.musicToken) this.musicIntent = this.musicId
      return
    }
    const now = ctx.currentTime
    this.fadeMusicOut()
    const source = ctx.createBufferSource()
    const bed = ctx.createGain()
    source.buffer = buffer
    source.loop = loop
    bed.gain.setValueAtTime(0.0001, now)
    bed.gain.linearRampToValueAtTime(1, now + (this.musicSource ? MUSIC_FADE : 0.8))
    source.connect(bed)
    bed.connect(this.duckGain)
    source.start(now)
    source.onended = () => {
      if (this.musicSource !== source) return
      try {
        source.disconnect()
        bed.disconnect()
      } catch {
        // Already disconnected during a transition.
      }
    }
    this.musicSource = source
    this.bedGain = bed
    this.musicId = id
  }

  private fadeMusicOut(): void {
    const ctx = this.ctx
    const source = this.musicSource
    const bed = this.bedGain
    if (!ctx || !source || !bed) return
    const now = ctx.currentTime
    this.musicSource = null
    this.bedGain = null
    try {
      bed.gain.cancelScheduledValues(now)
      bed.gain.setValueAtTime(Math.max(0.0001, bed.gain.value), now)
      bed.gain.linearRampToValueAtTime(0.0001, now + MUSIC_FADE)
      source.stop(now + MUSIC_FADE + 0.05)
    } catch {
      this.stopNode(source, bed)
    }
  }

  private stopMusicNode(): void {
    const source = this.musicSource
    const bed = this.bedGain
    this.musicSource = null
    this.bedGain = null
    if (source && bed) this.stopNode(source, bed)
  }

  private playNamed(
    name: SfxName,
    priority: number,
    cooldown: number,
    maxSame: number,
    team?: TeamId,
    delay = 0,
    amount = 1,
  ): void {
    if (this.muted) return
    if (this.page === 'battle') this.wakeBattleAudio()
    const ctx = this.ensure()
    if (!ctx || !this.sfxGain) return
    const url = `/audio/sfx/${name}.wav`
    const ready = this.cache.get(url)
    const begin = (buffer: AudioBuffer) => {
      const run = () => {
        if (ctx.state === 'running') {
          this.startVoice(buffer, name, priority, cooldown, maxSame, team, delay, amount)
          return
        }
        void ctx.resume().then(() => {
          if (ctx.state === 'running') this.startVoice(buffer, name, priority, cooldown, maxSame, team, delay, amount)
        }).catch(() => undefined)
      }
      run()
    }
    if (ready) {
      begin(ready)
      return
    }
    void this.load(url).then((buffer) => {
      if (!buffer || this.muted) return
      begin(buffer)
    })
  }

  private startVoice(
    buffer: AudioBuffer,
    key: string,
    priority: number,
    cooldown: number,
    maxSame: number,
    team: TeamId | undefined,
    delay: number,
    amount: number,
  ): void {
    const ctx = this.ctx
    const bus = this.sfxGain
    if (!ctx || !bus) return
    const now = ctx.currentTime
    const last = this.lastAt.get(key) ?? -10
    if (now - last < cooldown) return
    this.voices = this.voices.filter((voice) => voice.source.context.state !== 'closed')
    const same = this.voices.filter((voice) => voice.key === key)
    if (same.length >= maxSame) {
      if (priority < 5) return
      const oldest = same.reduce((best, voice) => (voice.started < best.started ? voice : best))
      this.stopVoice(oldest)
    }
    if (!this.makeRoom(priority)) return
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffer
  source.playbackRate.value = (team === 'red' ? 0.985 : team === 'blue' ? 1.045 : 1) * (0.97 + Math.random() * 0.06)
    const level = Math.max(0.2, Math.min(1, amount)) * (priority >= 5 ? 0.92 : 0.78)
    const at = now + Math.max(0, delay)
    gain.gain.setValueAtTime(level, at)
    source.connect(gain)
    gain.connect(bus)
    const voice: Voice = { key, priority, started: at, source, gain }
    this.voices.push(voice)
    this.lastAt.set(key, now)
    source.onended = () => {
      const index = this.voices.indexOf(voice)
      if (index >= 0) this.voices.splice(index, 1)
      try {
        source.disconnect()
        gain.disconnect()
      } catch {
        // Node was already stopped to free a voice slot.
      }
    }
    try {
      source.start(at)
    } catch (error) {
      this.noteError(key, error)
    }
  }

  private makeRoom(priority: number): boolean {
    if (this.voices.length < MAX_VOICES) return true
    let victim = this.voices[0]
    if (!victim) return true
    for (const voice of this.voices) {
      if (voice.priority < victim.priority || (voice.priority === victim.priority && voice.started < victim.started)) {
        victim = voice
      }
    }
    if (victim.priority > priority) return false
    if (victim.priority === priority && priority < 5) return false
    this.stopVoice(victim)
    return true
  }

  private stopVoice(voice: Voice): void {
    const index = this.voices.indexOf(voice)
    if (index >= 0) this.voices.splice(index, 1)
    this.stopNode(voice.source, voice.gain)
  }

  private stopVoices(): void {
    for (const voice of this.voices) this.stopNode(voice.source, voice.gain)
    for (const voice of this.attackVoices) this.stopNode(voice.source, voice.gain)
    this.voices = []
    this.attackVoices = []
  }

  private stopNode(source: AudioBufferSourceNode, gain: GainNode): void {
    try {
      source.stop()
    } catch {
      // Already stopped.
    }
    try {
      source.disconnect()
      gain.disconnect()
    } catch {
      // Already disconnected.
    }
  }

  private async finishUnlock(): Promise<void> {
    await this.background.prepare()
    if (this.background.hasAudio()) {
      this.pending = null
      this.adoptTrack()
    } else if (this.background.isMissing()) this.flushPending()
    this.background.markUnlocked()
  }

  private adoptTrack(): void {
    if (!this.background.hasAudio()) return
    this.layersLive = false
    this.pending = null
    if (this.bedSuppressed) return
    this.bedSuppressed = true
    this.clearMatchLayers()
    this.stopMusic()
  }

  private ensure(): AudioContext | null {
    if (!this.unlocked || typeof window === 'undefined') return null
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
      return this.ctx
    }
    const AudioCtx = window.AudioContext
    if (!AudioCtx) return null
    try {
      const ctx = new AudioCtx()
      const built = createAudioGraph(ctx)
      built.master.gain.value = this.muted ? 0 : this.masterVolume
      built.bedTrim.gain.value = this.musicVolume
      built.effects.gain.value = this.sfxVolume
      this.ctx = ctx
      this.masterGain = built.master
      this.musicGain = built.bedTrim
      this.sfxGain = built.effects
      this.duckGain = built.duck
      return ctx
    } catch (error) {
      this.noteError('audio-context', error)
      return null
    }
  }

  private preload(): void {
    const urls = [
      ...Object.values(MUSIC_URL),
      ...Object.values(LAYER_URL),
      ...sfxNames().map((name) => `/audio/sfx/${name}.wav`),
    ]
    for (const url of urls) void this.load(url)
  }

  private load(url: string): Promise<AudioBuffer | null> {
    const cached = this.cache.get(url)
    if (cached) return Promise.resolve(cached)
    if (this.failed.has(url)) return Promise.resolve(null)
    const pending = this.loading.get(url)
    if (pending) return pending
    const ctx = this.ctx
    if (!ctx) return Promise.resolve(null)
    const task = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${url}`)
        return response.arrayBuffer()
      })
      .then((bytes) => ctx.decodeAudioData(bytes.slice(0)))
      .then((buffer) => {
        this.cache.set(url, buffer)
        return buffer
      })
      .catch((error: unknown) => {
        this.failed.add(url)
        this.noteError(url, error)
        return null
      })
      .finally(() => {
        this.loading.delete(url)
      })
    this.loading.set(url, task)
    return task
  }

  private applyMaster(): void {
    this.setGain(this.masterGain, this.muted ? 0 : this.masterVolume)
  }

  private setGain(node: GainNode | null, value: number): void {
    if (!node || !this.ctx) return
    const now = this.ctx.currentTime
    node.gain.cancelScheduledValues(now)
    node.gain.setValueAtTime(node.gain.value, now)
    node.gain.linearRampToValueAtTime(Math.max(0, value), now + 0.08)
  }

  private noteError(label: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.lastError = `${label}: ${message}`
    if (import.meta.env.DEV) console.warn('[aurora audio]', this.lastError)
  }
}

function sfxNames(): SfxName[] {
  return [
    'gift-small',
    'gift-medium',
    'gift-large',
    'atk-like',
    'atk-follow',
    'atk-share',
    'atk-small',
    'atk-medium',
    'atk-big',
    'hit-small',
    'hit-medium',
    'hit-large',
    'projectile',
    'laser',
    'missile-launch',
    'missile-flight',
    'missile-impact',
    'power-charge',
    'power-release',
    'explosion-small',
    'explosion-large',
    'lightning',
    'fire',
    'tornado',
    'meteor-fall',
    'meteor-impact',
    'ultimate-charge',
    'ultimate-impact',
    'combo',
    'combo-high',
    'momentum',
    'team-lead',
    'countdown-tick',
    'countdown-final',
    'final-rush-start',
    'battle-start',
    'victory',
  ]
}

interface Cue {
  file: SfxName
  priority: number
  cooldown: number
  voices: number
  amount: number
}

const CAST_CUE: Record<AttackStyle, Cue> = {
  pulse: { file: 'atk-like', priority: 1, cooldown: 0, voices: 12, amount: 0.52 },
  comet: { file: 'atk-follow', priority: 2, cooldown: 0, voices: 4, amount: 0.66 },
  portal: { file: 'atk-share', priority: 2, cooldown: 0, voices: 4, amount: 0.76 },
  rose: { file: 'atk-small', priority: 2, cooldown: 0, voices: 3, amount: 0.86 },
  maple: { file: 'atk-big', priority: 3, cooldown: 0, voices: 2, amount: 1 },
  star: { file: 'atk-medium', priority: 3, cooldown: 0, voices: 3, amount: 0.94 },
  vortex: { file: 'atk-big', priority: 3, cooldown: 0, voices: 2, amount: 1 },
  planet: { file: 'atk-big', priority: 4, cooldown: 0, voices: 2, amount: 1 },
  crystal: { file: 'atk-big', priority: 4, cooldown: 0, voices: 2, amount: 1 },
  eclipse: { file: 'atk-big', priority: 4, cooldown: 0, voices: 2, amount: 1 },
}

const HIT_CUE: Record<AttackStyle, Cue> = {
  pulse: { file: 'hit-small', priority: 1, cooldown: 0, voices: 10, amount: 0.4 },
  comet: { file: 'hit-medium', priority: 2, cooldown: 0, voices: 4, amount: 0.55 },
  portal: { file: 'hit-medium', priority: 2, cooldown: 0, voices: 4, amount: 0.58 },
  rose: { file: 'hit-medium', priority: 2, cooldown: 0, voices: 3, amount: 0.68 },
  maple: { file: 'hit-large', priority: 3, cooldown: 0, voices: 2, amount: 0.86 },
  star: { file: 'hit-large', priority: 3, cooldown: 0, voices: 3, amount: 0.78 },
  vortex: { file: 'hit-large', priority: 3, cooldown: 0, voices: 2, amount: 0.86 },
  planet: { file: 'hit-large', priority: 4, cooldown: 0, voices: 2, amount: 0.95 },
  crystal: { file: 'hit-large', priority: 4, cooldown: 0, voices: 2, amount: 0.9 },
  eclipse: { file: 'hit-large', priority: 4, cooldown: 0, voices: 2, amount: 0.95 },
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
