import type { BattleStatus, TimerPhase } from '../types/Battle.ts'
import {
  audioTabId,
  claimStream,
  clearProducer,
  getAudioGraph,
  noteProducer,
  releaseStream,
  streamOwner,
  streamProducers,
  type AudioRoute,
} from './AudioManager.ts'
import {
  backgroundMusicConfig,
  countdownVolume,
  fallbackTrackSrc,
  musicStorageKeys,
  victoryDuckVolume,
} from './audioConfig.ts'

export interface MusicController {
  load(src: string): Promise<void>
  play(): Promise<void>
  pause(): void
  stop(): void
  setVolume(volume: number): void
  fadeTo(volume: number, duration: number): void
  duck(volume: number, duration: number): void
  restart(): void
}

export interface MusicStatus {
  filename: string
  configured: string
  loading: boolean
  missing: boolean
  fallback: boolean
  state: 'idle' | 'loading' | 'playing' | 'paused' | 'missing' | 'blocked'
  currentTime: number
  duration: number
  volume: number
  userVolume: number
  unlocked: boolean
  enabled: boolean
  muted: boolean
  loop: boolean
  allowRate: boolean
  playbackRate: number
  blocked: boolean
  duplicateBattle: boolean
  streamElsewhere: boolean
  foreignOwner: boolean
}

interface MusicScene {
  volume: number
  lowpass: boolean
}

interface PendingFile {
  src: string
  name: string
  bytes: ArrayBuffer
  fallback: boolean
}

/**
 * One looping bed. Scene changes move the gain, not the playhead.
 */
export class BackgroundMusic implements MusicController {
  userVolume = readNumber(musicStorageKeys.volume, backgroundMusicConfig.defaultVolume)
  unlocked = false
  private route: AudioRoute | 'none' = 'none'
  private enabled = readBool(musicStorageKeys.enabled, backgroundMusicConfig.enabled)
  private muted = readBool(musicStorageKeys.muted, false)
  private loop = readBool(musicStorageKeys.loop, backgroundMusicConfig.loop)
  private allowRate = readBool(musicStorageKeys.allowRate, false)
  private playbackRate = readRate()
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private loadedSrc = ''
  private filename = fileName(backgroundMusicConfig.src)
  private fallback = false
  private missing = false
  private loading = false
  private attempted = false
  private blocked = false
  private explicit = false
  private userPaused = false
  private ducking = false
  private lowpass = false
  private sceneVolume = countdownVolume
  private duckFloor = 1
  private offset = 0
  private startedAt = 0
  private objectUrl = ''
  private loadToken = 0
  private playToken = 0
  private starting = false
  private loadingDone: Promise<void> = Promise.resolve()
  private waiting: PendingFile | null = null
  private onAudible: (() => void) | null = null

  setRoute(route: AudioRoute | 'none'): void {
    this.route = route
  }

  setAudibleListener(listener: (() => void) | null): void {
    this.onAudible = listener
  }

  clearUserPause(): void {
    this.userPaused = false
  }

  clearBlocked(): void {
    this.blocked = false
  }

  armExplicit(): void {
    this.explicit = true
    this.userPaused = false
    this.blocked = false
  }

  hasAudio(): boolean {
    return this.buffer != null
  }

  isPlaying(): boolean {
    return this.source != null
  }

  isEnabled(): boolean {
    return this.enabled
  }

  isMissing(): boolean {
    return this.missing
  }

  async prepare(): Promise<void> {
    if (this.buffer && this.loadedSrc && !this.loadedSrc.startsWith('blob:')) return
    if (this.waiting) return
    if (this.loading) return this.loadingDone
    if (this.attempted && this.missing) return
    await this.loadPrimary()
  }

  markUnlocked(): void {
    this.unlocked = true
    if (this.route === 'battle' && this.enabled && !this.userPaused) void this.play()
  }

  async load(src: string): Promise<void> {
    await this.decodeUrl(src, fileName(src), false, false)
  }

  async loadFile(file: File): Promise<void> {
    this.releaseCustom()
    const url = URL.createObjectURL(file)
    this.objectUrl = url
    await this.decodeUrl(url, file.name || 'selected-audio', false, true)
    if (this.buffer && this.route === 'admin') {
      this.armExplicit()
      await this.play()
    }
  }

  async reloadConfigured(): Promise<void> {
    this.releaseCustom()
    this.stopSource()
    this.buffer = null
    this.loadedSrc = ''
    this.attempted = false
    this.missing = false
    this.waiting = null
    await this.loadPrimary()
  }

  async play(): Promise<void> {
    if (!this.enabled || this.userPaused) return
    if (this.route === 'none') return
    if (this.route === 'admin' && !this.explicit) return
    if (!this.unlocked && this.route === 'battle') return
    if (this.source) {
      if (!this.claim()) return
      noteProducer(this.route)
      return
    }
    if (this.starting) return
    if (this.attempted && !this.buffer && !this.waiting && !this.loading) return
    const token = this.playToken
    this.starting = true
    try {
      if (this.loading) await this.loadingDone
      if (token !== this.playToken) return
      if (this.waiting) await this.decodeWaiting()
      if (token !== this.playToken) return
      if (!this.buffer && !this.attempted) {
        await this.prepare()
        await this.decodeWaiting()
      }
      if (token !== this.playToken || !this.buffer) return
      if (!this.claim()) return
    const nodes = getAudioGraph()
    if (!nodes) return
    if (nodes.context.state === 'suspended') {
      try {
        await nodes.context.resume()
      } catch {
        return
      }
    }
    if (token !== this.playToken || this.source) return
      this.startSource(nodes)
    } finally {
      this.starting = false
    }
  }

  pause(): void {
    this.pauseInternal('user')
  }

  stop(): void {
    this.playToken += 1
    this.offset = 0
    this.userPaused = false
    this.explicit = false
    this.blocked = false
    this.ducking = false
    this.stopSource()
    releaseStream()
    clearProducer()
  }

  restart(): void {
    this.offset = 0
    this.userPaused = false
    this.armExplicit()
    this.stopSource()
    void this.play()
  }

  setVolume(volume: number): void {
    this.userVolume = clamp01(volume)
    writeNumber(musicStorageKeys.volume, this.userVolume)
    this.applyCurrent(backgroundMusicConfig.fadeDurationMs / 1000)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    writeBool(musicStorageKeys.enabled, enabled)
    if (!enabled) this.pauseInternal('system')
    else this.applyCurrent(0.2)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    writeBool(musicStorageKeys.muted, muted)
    this.applyCurrent(0.12)
  }

  setLoop(loop: boolean): void {
    this.loop = loop
    writeBool(musicStorageKeys.loop, loop)
    if (this.source) this.source.loop = loop
  }

  setAllowRate(allow: boolean): void {
    this.allowRate = allow
    writeBool(musicStorageKeys.allowRate, allow)
    if (!allow) {
      this.playbackRate = 1
      writeNumber(musicStorageKeys.rate, 1)
      this.applyRate()
    }
  }

  setPlaybackRate(rate: number): void {
    if (!this.allowRate) return
    this.playbackRate = Math.min(1.5, Math.max(0.5, rate))
    writeNumber(musicStorageKeys.rate, this.playbackRate)
    this.applyRate()
  }

  fadeTo(volume: number, duration: number): void {
    this.sceneVolume = clamp01(volume)
    if (this.ducking) return
    this.ramp(this.scaled(this.sceneVolume), duration)
  }

  duck(volume: number, duration: number): void {
    this.ducking = true
    this.duckFloor = clamp01(volume)
    const target = Math.min(this.scaled(this.sceneVolume), this.scaled(this.duckFloor))
    this.ramp(target, duration)
  }

  releaseDuck(duration: number): void {
    this.ducking = false
    this.ramp(this.scaled(this.sceneVolume), duration)
  }

  applyScene(scene: MusicScene, duration = backgroundMusicConfig.fadeDurationMs / 1000): void {
    if (scene.lowpass !== this.lowpass) {
      this.lowpass = scene.lowpass
      this.rampFilter(scene.lowpass, duration)
    }
    if (Math.abs(this.sceneVolume - scene.volume) < 0.001) return
    this.fadeTo(scene.volume, duration)
  }

  preview(volume: number, lowpass: boolean, duration: number): void {
    this.lowpass = lowpass
    this.rampFilter(lowpass, duration)
    this.fadeTo(volume, duration)
  }

  releaseCustom(): void {
    if (!this.objectUrl) return
    URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = ''
    if (this.loadedSrc.startsWith('blob:')) {
      this.stopSource()
      this.buffer = null
      this.loadedSrc = ''
      this.fallback = false
      this.attempted = false
    }
  }

  status(): MusicStatus {
    const owner = streamOwner()
    const producers = streamProducers()
    const battleCount = producers.filter((item) => item.route === 'battle').length
    const elsewhere = !!owner && owner.id !== audioTabId()
    return {
      filename: this.filename,
      configured: fileName(backgroundMusicConfig.src),
      loading: this.loading,
      missing: this.missing && !this.buffer,
      fallback: this.fallback,
      state: this.playbackState(),
      currentTime: this.currentTime(),
      duration: this.buffer?.duration ?? 0,
      volume: this.heardVolume(),
      userVolume: this.userVolume,
      unlocked: this.unlocked,
      enabled: this.enabled,
      muted: this.muted,
      loop: this.loop,
      allowRate: this.allowRate,
      playbackRate: this.allowRate ? this.playbackRate : 1,
      blocked: this.blocked,
      duplicateBattle: battleCount >= 2,
      streamElsewhere: elsewhere && owner.route === 'battle',
      foreignOwner: elsewhere,
    }
  }

  private async loadPrimary(): Promise<void> {
    const token = ++this.loadToken
    this.loading = true
    this.missing = false
    let finish: () => void = () => undefined
    this.loadingDone = new Promise<void>((resolve) => {
      finish = resolve
    })
    try {
      const primary = await this.fetchBytes(backgroundMusicConfig.src)
      if (token !== this.loadToken) return
      if (primary) {
        const decoded = await this.decodeBytes(primary, backgroundMusicConfig.src, fileName(backgroundMusicConfig.src), false)
        if (token !== this.loadToken) return
        if (decoded) return
      }
      const fallback = await this.fetchBytes(fallbackTrackSrc)
      if (token !== this.loadToken) return
      if (fallback) {
        await this.decodeBytes(fallback, fallbackTrackSrc, fileName(fallbackTrackSrc), true)
        if (token !== this.loadToken) return
        if (this.buffer) return
      }
      if (!this.waiting) {
        this.buffer = null
        this.missing = true
        this.fallback = false
        this.filename = fileName(backgroundMusicConfig.src)
      }
    } finally {
      if (token === this.loadToken) {
        this.loading = false
        this.attempted = !this.waiting
      }
      finish()
    }
  }

  private async decodeUrl(src: string, name: string, fallback: boolean, replace: boolean): Promise<void> {
    if (!replace && this.buffer && this.loadedSrc === src) return
    const token = ++this.loadToken
    this.loading = true
    this.missing = false
    let finish: () => void = () => undefined
    this.loadingDone = new Promise<void>((resolve) => {
      finish = resolve
    })
    try {
      const bytes = await this.fetchBytes(src)
      if (token !== this.loadToken) return
      if (!bytes) {
        this.missing = true
        this.filename = name
        return
      }
      await this.decodeBytes(bytes, src, name, fallback)
    } finally {
      if (token === this.loadToken) {
        this.loading = false
        this.attempted = !this.waiting
      }
      finish()
    }
  }

  private async fetchBytes(src: string): Promise<ArrayBuffer | null> {
    try {
      const response = await fetch(src)
      if (!response.ok) return null
      return await response.arrayBuffer()
    } catch {
      return null
    }
  }

  private async decodeBytes(bytes: ArrayBuffer, src: string, name: string, fallback: boolean): Promise<boolean> {
    const nodes = getAudioGraph()
    if (!nodes) {
      this.waiting = { src, name, bytes, fallback }
      this.filename = name
      this.missing = false
      return false
    }
    try {
      const buffer = await nodes.context.decodeAudioData(bytes.slice(0))
      this.useBuffer(buffer, src, name, fallback)
      return true
    } catch {
      this.missing = true
      this.filename = name
      return false
    }
  }

  private async decodeWaiting(): Promise<void> {
    const waiting = this.waiting
    if (!waiting) return
    const nodes = getAudioGraph()
    if (!nodes) return
    this.waiting = null
    try {
      const buffer = await nodes.context.decodeAudioData(waiting.bytes.slice(0))
      this.useBuffer(buffer, waiting.src, waiting.name, waiting.fallback)
      this.missing = false
      this.attempted = true
    } catch {
      this.missing = true
      this.attempted = true
      this.filename = waiting.name
    }
  }

  private useBuffer(buffer: AudioBuffer, src: string, name: string, fallback: boolean): void {
    const changed = this.loadedSrc !== src
    this.buffer = buffer
    this.loadedSrc = src
    this.filename = name
    this.fallback = fallback
    this.missing = false
    this.waiting = null
    if (changed && this.source) {
      this.offset = 0
      this.stopSource()
      void this.play()
    } else if (this.buffer) {
      this.onAudible?.()
    }
  }

  private claim(): boolean {
    if (this.route === 'none') return false
    const claimed = claimStream(this.route)
    this.blocked = !claimed
    if (!claimed) this.pauseInternal('system')
    return claimed
  }

  private startSource(nodes: NonNullable<ReturnType<typeof getAudioGraph>>): void {
    if (!this.buffer) return
    const source = nodes.context.createBufferSource()
    source.buffer = this.buffer
    source.loop = this.loop
    source.loopStart = 0
    source.loopEnd = this.buffer.duration
    if (this.allowRate && this.playbackRate !== 1) source.playbackRate.setValueAtTime(this.playbackRate, nodes.context.currentTime)
    source.connect(nodes.music)
    const duration = this.buffer.duration
    const offset = Number.isFinite(this.offset) && this.offset > 0 && this.offset < duration ? this.offset : 0
    const now = nodes.context.currentTime
    const level = Math.max(0.0001, this.targetGain())
    nodes.music.gain.cancelScheduledValues(now)
    nodes.music.gain.setValueAtTime(0.0001, now)
    nodes.music.gain.linearRampToValueAtTime(level, now + 0.03)
    try {
      source.start(now, offset)
    } catch {
      try {
        source.disconnect()
      } catch {
        // The start failed before the node joined the graph.
      }
      return
    }
    this.source = source
    this.startedAt = now
    this.offset = offset
    this.blocked = false
    source.onended = () => {
      if (this.source !== source) return
      this.source = null
    }
    noteProducer(this.route === 'none' ? 'battle' : this.route)
    this.onAudible?.()
  }

  private pauseInternal(reason: 'user' | 'system'): void {
    if (reason === 'user') {
      this.userPaused = true
      this.explicit = false
    }
    if (!this.source && reason === 'system') return
    this.offset = this.currentTime()
    this.stopSource()
    releaseStream()
    clearProducer()
  }

  private stopSource(): void {
    const source = this.source
    this.source = null
    if (!source) return
    try {
      source.onended = null
      source.stop()
      source.disconnect()
    } catch {
      // Already stopped.
    }
  }

  private applyCurrent(duration: number): void {
    if (this.ducking) this.duck(this.duckFloor, duration)
    else this.ramp(this.scaled(this.sceneVolume), duration)
  }

  private applyRate(): void {
    const nodes = getAudioGraph()
    if (!this.source || !nodes) return
    const rate = this.allowRate ? this.playbackRate : 1
    this.source.playbackRate.setValueAtTime(rate, nodes.context.currentTime)
  }

  private ramp(value: number, duration: number): void {
    const nodes = getAudioGraph()
    if (!nodes) return
    const now = nodes.context.currentTime
    const gain = nodes.music.gain
    const safe = Math.max(0.0001, value)
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(Math.max(0.0001, gain.value), now)
    gain.linearRampToValueAtTime(safe, now + Math.max(0.05, duration))
    if (value <= 0.0001) gain.linearRampToValueAtTime(0.0001, now + Math.max(0.05, duration))
  }

  private rampFilter(active: boolean, duration: number): void {
    const nodes = getAudioGraph()
    if (!nodes) return
    const now = nodes.context.currentTime
    const freq = nodes.intensity.frequency
    freq.cancelScheduledValues(now)
    freq.setValueAtTime(Math.max(80, freq.value), now)
    freq.linearRampToValueAtTime(active ? 3200 : 18000, now + Math.max(0.05, duration))
  }

  private targetGain(): number {
    if (this.ducking) return Math.min(this.scaled(this.sceneVolume), this.scaled(this.duckFloor))
    return this.scaled(this.sceneVolume)
  }

  private scaled(volume: number): number {
    if (this.muted || !this.enabled) return 0
    const scale = this.userVolume / backgroundMusicConfig.defaultVolume
    return Math.min(1, Math.max(0, volume * scale))
  }

  private heardVolume(): number {
    const nodes = getAudioGraph()
    if (!nodes) return this.targetGain()
    return nodes.music.gain.value
  }

  private currentTime(): number {
    if (!this.buffer) return 0
    if (!this.source) return this.offset
    const nodes = getAudioGraph()
    if (!nodes) return this.offset
    const elapsed = nodes.context.currentTime - this.startedAt
    const time = this.offset + Math.max(0, elapsed)
    if (this.loop && this.buffer.duration > 0) return time % this.buffer.duration
    return Math.min(time, this.buffer.duration)
  }

  private playbackState(): MusicStatus['state'] {
    if (this.loading) return 'loading'
    if (this.blocked) return 'blocked'
    if (this.source) return 'playing'
    if (this.userPaused) return 'paused'
    if (this.attempted && !this.buffer && !this.waiting) return 'missing'
    return 'idle'
  }
}

export function musicSceneFor(status: BattleStatus, phase: TimerPhase, timeLeftMs: number, endless: boolean): MusicScene {
  if (status === 'victory') return { volume: victoryDuckVolume, lowpass: false }
  if (status === 'paused' || status === 'resetting') return { volume: backgroundMusicConfig.waitingVolume, lowpass: false }
  if (status === 'countdown') return { volume: countdownVolume, lowpass: false }
  if (status === 'running' && !endless && (phase === 'final_10' || timeLeftMs <= 10_000)) {
    return { volume: backgroundMusicConfig.finalThirtySecondsVolume, lowpass: true }
  }
  if (status === 'running' && !endless && (phase === 'final_rush' || timeLeftMs <= 30_000)) {
    const start = backgroundMusicConfig.battleVolume
    const end = backgroundMusicConfig.finalThirtySecondsVolume
    const left = Math.min(30_000, Math.max(10_000, timeLeftMs))
    const mix = (30_000 - left) / 20_000
    return { volume: start + (end - start) * mix, lowpass: false }
  }
  if (status === 'running') return { volume: backgroundMusicConfig.battleVolume, lowpass: false }
  return { volume: backgroundMusicConfig.waitingVolume, lowpass: false }
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const remain = whole % 60
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

function fileName(src: string): string {
  const clean = src.split('?')[0] ?? src
  const name = clean.split('/').pop()
  return name && name.length > 0 ? name : 'audio'
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    // Storage can be unavailable. The in-memory default still works.
  }
  return fallback
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Ignore persistence failures.
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const value = Number(raw)
    if (Number.isFinite(value)) return clamp01(value)
  } catch {
    // Ignore unreadable storage.
  }
  return fallback
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Ignore persistence failures.
  }
}

function readRate(): number {
  try {
    const raw = localStorage.getItem(musicStorageKeys.rate)
    if (raw == null) return 1
    const value = Number(raw)
    if (Number.isFinite(value)) return Math.min(1.5, Math.max(0.5, value))
  } catch {
    // Ignore unreadable storage.
  }
  return 1
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
