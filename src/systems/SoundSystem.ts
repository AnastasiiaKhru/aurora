import type { SoundEffectId } from '../types/Gift.ts'

type Intensity = 'normal' | 'rush' | 'final' | 'victory'

export class SoundManager {
  muted = false
  private ctx: AudioContext | null = null
  private noise: AudioBuffer | null = null
  private pad: { osc: OscillatorNode; gain: GainNode } | null = null
  private intensity: Intensity = 'normal'
  private unlocked = false

  constructor() {
    if (typeof window === 'undefined') return
    const unlock = () => {
      this.ensure()
      window.removeEventListener('pointerdown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
  }

  toggle(): boolean {
    this.muted = !this.muted
    this.ensure()
    this.applyPad()
    return this.muted
  }

  setIntensity(level: Intensity): void {
    this.intensity = level
    this.applyPad()
  }

  play(id: SoundEffectId, amount = 1): void {
    if (this.muted) return
    const ctx = this.ensure()
    if (!ctx) return
    try {
      const gain = Math.max(0.05, Math.min(1, amount))
      switch (id) {
        case 'small_hit':
          this.tone(ctx, 620, 740, 0.09, 'sine', 0.05 * gain)
          break
        case 'projectile':
          this.tone(ctx, 420, 860, 0.12, 'triangle', 0.05 * gain)
          break
        case 'magic':
          this.tone(ctx, 520, 880, 0.18, 'sine', 0.05 * gain)
          this.tone(ctx, 780, 1180, 0.22, 'triangle', 0.03 * gain)
          break
        case 'rocket':
          this.noiseBurst(ctx, 0.28, 900, 0.07 * gain)
          this.tone(ctx, 180, 70, 0.28, 'sawtooth', 0.03 * gain)
          break
        case 'explosion':
          this.noiseBurst(ctx, 0.38, 420, 0.1 * gain)
          this.tone(ctx, 90, 42, 0.4, 'sine', 0.07 * gain)
          break
        case 'fire':
          this.noiseBurst(ctx, 0.32, 700, 0.06 * gain)
          this.tone(ctx, 240, 120, 0.2, 'triangle', 0.03 * gain)
          break
        case 'electricity':
          this.tone(ctx, 880, 1400, 0.07, 'square', 0.025 * gain)
          this.tone(ctx, 1320, 540, 0.09, 'square', 0.02 * gain)
          this.noiseBurst(ctx, 0.08, 1800, 0.03 * gain)
          break
        case 'tornado':
          this.noiseBurst(ctx, 0.7, 500, 0.05 * gain)
          this.tone(ctx, 160, 90, 0.6, 'sine', 0.03 * gain)
          break
        case 'meteor':
          this.tone(ctx, 140, 36, 0.7, 'sine', 0.08 * gain)
          this.noiseBurst(ctx, 0.55, 280, 0.09 * gain)
          break
        case 'combo':
          this.tone(ctx, 660, 990, 0.12, 'triangle', 0.05 * gain)
          this.tone(ctx, 990, 1320, 0.16, 'sine', 0.04 * gain)
          break
        case 'countdown':
          this.tone(ctx, 480 + gain * 420, 640 + gain * 280, 0.12, 'sine', 0.06)
          break
        case 'victory':
          this.chord()
          break
        case 'whoosh':
          this.noiseBurst(ctx, 0.22, 1200, 0.04 * gain)
          this.tone(ctx, 300, 700, 0.18, 'sine', 0.03 * gain)
          break
        default:
          break
      }
    } catch {
      // Missing output devices or a closed audio context should never break combat.
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
      return this.ctx
    }
    const AudioCtx = window.AudioContext
    if (!AudioCtx) return null
    try {
      this.ctx = new AudioCtx()
      this.noise = this.makeNoise(this.ctx)
      this.unlocked = true
      this.startPad(this.ctx)
      return this.ctx
    } catch {
      return null
    }
  }

  private startPad(ctx: AudioContext): void {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 64
    gain.gain.value = 0.0001
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    this.pad = { osc, gain }
    this.applyPad()
  }

  private applyPad(): void {
    if (!this.pad || !this.ctx) return
    const now = this.ctx.currentTime
    const freq = this.intensity === 'final' ? 96 : this.intensity === 'rush' ? 78 : this.intensity === 'victory' ? 128 : 62
    const level = this.muted || !this.unlocked ? 0.0001 : this.intensity === 'normal' ? 0.004 : 0.016
    this.pad.osc.frequency.linearRampToValueAtTime(freq, now + 0.35)
    this.pad.gain.gain.linearRampToValueAtTime(level, now + 0.3)
  }

  private tone(
    ctx: AudioContext,
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const now = ctx.currentTime
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(40, from), now)
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), now + dur)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + dur + 0.02)
  }

  private noiseBurst(ctx: AudioContext, dur: number, cutoff: number, volume: number): void {
    if (!this.noise) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    const gain = ctx.createGain()
    const now = ctx.currentTime
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    src.start(now)
    src.stop(now + dur)
  }

  private chord(): void {
    const ctx = this.ctx
    if (!ctx) return
    ;[523, 659, 784, 1046].forEach((freq, index) => {
      window.setTimeout(() => {
        if (!this.ctx || this.muted) return
        this.tone(this.ctx, freq, freq * 1.01, 0.35, 'triangle', 0.045)
      }, index * 110)
    })
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
    return buffer
  }
}
