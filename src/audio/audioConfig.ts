/**
 * Drop a legally licensed file at public/audio/background-track.mp3.
 * This project does not download or bundle a commercial recording.
 * A missing file falls back to the local royalty-free bed, then to silence.
 */
export const backgroundMusicConfig = {
  enabled: false,
  src: '/audio/background-track.mp3',
  defaultVolume: 0.25,
  battleVolume: 0.3,
  finalThirtySecondsVolume: 0.38,
  waitingVolume: 0.15,
  loop: true,
  fadeDurationMs: 600,
}

/** Countdown sits on the default mix. It is not a separate saved preference. */
export const countdownVolume = 0.25

/** Victory dips the bed so the victory sting stays intelligible. */
export const victoryDuckVolume = 0.08

export const fallbackTrackSrc = '/audio/music/battle-main.wav'

export const duckingLevels = {
  like: 0.24,
  follow: 0.2,
  share: 0.18,
  smallGift: 0.18,
  mediumGift: 0.14,
  largeGift: 0.1,
  legendaryGift: 0.06,
} as const

export type DuckKind = keyof typeof duckingLevels

export const musicStorageKeys = {
  volume: 'aurora-music-volume',
  muted: 'aurora-music-muted',
  enabled: 'aurora-music-enabled',
  loop: 'aurora-music-loop',
  allowRate: 'aurora-music-allow-rate',
  rate: 'aurora-music-rate',
} as const
