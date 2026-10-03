import type { AttackType, GiftRarity, ShakeLevel } from '../types/Gift.ts'

export const rarityPriority: Record<GiftRarity, number> = {
  micro: 1,
  small: 2,
  medium: 3,
  large: 4,
  legendary: 5,
}

export const shakeAmount: Record<ShakeLevel, number> = {
  none: 0,
  small: 0.16,
  medium: 0.3,
  large: 0.52,
  legendary: 0.82,
}

export const attackImpacts: Record<AttackType, number[]> = {
  energy_bullet: [0.74],
  sparkle_shot: [0.7],
  rose: [0.72],
  heart: [0.76],
  fireball: [0.7],
  lightning: [0.16],
  magic: [0.74],
  rocket: [0.82],
  missile: [0.78],
  beam: [0.34],
  fire_blast: [0.48],
  tornado: [0.22, 0.5, 0.8],
  airstrike: [0.42, 0.6, 0.78],
  laser: [0.28],
  thunderstorm: [0.18, 0.36, 0.54, 0.74],
  meteor: [0.7],
  dragon: [0.34, 0.58, 0.84],
  black_hole: [0.74],
  cosmic: [0.42],
  sword: [0.38],
  firestorm: [0.3, 0.48, 0.66, 0.84],
  pulse: [0.18],
}

export const attackHeadlines: Record<AttackType, string> = {
  energy_bullet: 'ENERGY SHOT',
  sparkle_shot: 'SPARK BURST',
  rose: 'ROSE',
  heart: 'HEART',
  fireball: 'FIREBALL',
  lightning: 'LIGHTNING',
  magic: 'ARCANE',
  rocket: 'ROCKET',
  missile: 'MISSILE',
  beam: 'ENERGY BEAM',
  fire_blast: 'FIRE BLAST',
  tornado: 'TORNADO',
  airstrike: 'AIR STRIKE',
  laser: 'LASER',
  thunderstorm: 'THUNDERSTORM',
  meteor: 'METEOR',
  dragon: 'DRAGON',
  black_hole: 'BLACK HOLE',
  cosmic: 'COSMIC BURST',
  sword: 'SWORD STRIKE',
  firestorm: 'FIRE STORM',
  pulse: 'SURGE',
}

export const teamPalette = {
  red: 0xff4b63,
  redHot: 0xffb199,
  redDeep: 0x6d142c,
  blue: 0x3d8dff,
  blueIce: 0xc5e4ff,
  blueDeep: 0x12356f,
  gold: 0xe6c98a,
  ivory: 0xfff6ea,
  white: 0xffffff,
  ink: 0x07080c,
  cosmic: 0xc7b6ff,
  fire: 0xff7a3c,
}
