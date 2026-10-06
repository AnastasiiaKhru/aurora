import { backgroundMusicConfig, duckingLevels, type DuckKind } from './audioConfig.ts'
import type { AttackStyle } from '../game/attacks/style.ts'
import type { BackgroundMusic } from './MusicController.ts'

const STYLE_DUCK: Record<AttackStyle, DuckKind> = {
  pulse: 'like',
  comet: 'follow',
  portal: 'share',
  rose: 'smallGift',
  maple: 'largeGift',
  star: 'mediumGift',
  vortex: 'largeGift',
  planet: 'legendaryGift',
  crystal: 'legendaryGift',
  eclipse: 'legendaryGift',
}

const HOLD_SECONDS: Record<DuckKind, number> = {
  like: 0.32,
  follow: 0.5,
  share: 0.55,
  smallGift: 0.5,
  mediumGift: 0.65,
  largeGift: 0.85,
  legendaryGift: 1.2,
}

const DUCK_FADE = 0.2

/**
 * Fades the music bed around attack sounds.
 * Rapid likes extend one dip instead of pumping the volume.
 */
export class AttackSoundController {
  private holdUntil = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private activeLevel = 1
  private readonly music: BackgroundMusic

  constructor(music: BackgroundMusic) {
    this.music = music
  }

  cueSoft(): void {
    if (this.activeLevel < 0.9 && performance.now() / 1000 < this.holdUntil) return
    const now = performance.now() / 1000
    this.holdUntil = now + 0.18
    this.activeLevel = 0.92
    this.music.duck(0.92, 0.12)
    this.schedule()
  }

  cue(style: AttackStyle): void {
    const kind = STYLE_DUCK[style]
    const level = duckingLevels[kind]
    const now = performance.now() / 1000
    const grouped = now < this.holdUntil && level >= this.activeLevel - 0.001
    this.holdUntil = Math.max(this.holdUntil, now + HOLD_SECONDS[kind])
    if (!grouped) {
      this.activeLevel = level
      this.music.duck(level, DUCK_FADE)
    }
    this.schedule()
  }

  cancel(): void {
    this.clearTimer()
    this.holdUntil = 0
    this.activeLevel = 1
  }

  private schedule(): void {
    this.clearTimer()
    const wait = Math.max(16, this.holdUntil * 1000 - performance.now())
    this.timer = setTimeout(() => {
      if (performance.now() / 1000 < this.holdUntil - 0.02) {
        this.schedule()
        return
      }
      this.activeLevel = 1
      this.music.releaseDuck(backgroundMusicConfig.fadeDurationMs / 1000)
    }, wait)
  }

  private clearTimer(): void {
    if (this.timer == null) return
    clearTimeout(this.timer)
    this.timer = null
  }
}
