import type { AttackCommand } from '../../types/Battle.ts'
import type { AttackType, GiftRarity, ShakeLevel } from '../../types/Gift.ts'

export type AttackStyle =
  | 'pulse'
  | 'comet'
  | 'portal'
  | 'rose'
  | 'maple'
  | 'star'
  | 'vortex'
  | 'planet'
  | 'crystal'
  | 'eclipse'

export type AttackTier = 'micro' | 'small' | 'medium' | 'large' | 'legendary'

export const temporaryAttackScale = {
  like: 1.08,
  follow: 1.18,
  share: 1.22,
  smallGift: 1.16,
  mediumGift: 1.28,
  largeGift: 1.4,
  legendaryGift: 1.5,
} as const

export interface StyleSpec {
  id: AttackStyle
  tier: AttackTier
  duration: number
  temporaryScale: number
  permanentGrowth: number
  cameraShake: number
  soundId: AttackStyle
  attackType: AttackType
  rarity: GiftRarity
  shake: ShakeLevel
  impacts: number[]
  giftName: string
}

export const styles: Record<AttackStyle, StyleSpec> = {
  pulse: {
    id: 'pulse',
    tier: 'micro',
    duration: 0.72,
    temporaryScale: temporaryAttackScale.like,
    permanentGrowth: 0.004,
    cameraShake: 0,
    soundId: 'pulse',
    attackType: 'energy_bullet',
    rarity: 'micro',
    shake: 'none',
    impacts: [0.78],
    giftName: 'Like',
  },
  comet: {
    id: 'comet',
    tier: 'medium',
    duration: 1.15,
    temporaryScale: temporaryAttackScale.follow,
    permanentGrowth: 0.02,
    cameraShake: 0.2,
    soundId: 'comet',
    attackType: 'follow_blast',
    rarity: 'medium',
    shake: 'small',
    impacts: [0.76],
    giftName: 'Follow',
  },
  portal: {
    id: 'portal',
    tier: 'medium',
    duration: 1.35,
    temporaryScale: temporaryAttackScale.share,
    permanentGrowth: 0.016,
    cameraShake: 0.16,
    soundId: 'portal',
    attackType: 'share_shot',
    rarity: 'medium',
    shake: 'small',
    impacts: [0.58, 0.72, 0.86],
    giftName: 'Share',
  },
  rose: {
    id: 'rose',
    tier: 'small',
    duration: 1.45,
    temporaryScale: temporaryAttackScale.smallGift,
    permanentGrowth: 0.012,
    cameraShake: 0.12,
    soundId: 'rose',
    attackType: 'rose',
    rarity: 'small',
    shake: 'none',
    impacts: [0.74],
    giftName: 'Rose',
  },
  maple: {
    id: 'maple',
    tier: 'large',
    duration: 1.7,
    temporaryScale: temporaryAttackScale.largeGift,
    permanentGrowth: 0.026,
    cameraShake: 0.42,
    soundId: 'maple',
    attackType: 'meteor',
    rarity: 'large',
    shake: 'large',
    impacts: [0.78],
    giftName: 'Maple Meteor',
  },
  star: {
    id: 'star',
    tier: 'large',
    duration: 1.55,
    temporaryScale: temporaryAttackScale.mediumGift,
    permanentGrowth: 0.02,
    cameraShake: 0.28,
    soundId: 'star',
    attackType: 'beam',
    rarity: 'large',
    shake: 'medium',
    impacts: [0.62],
    giftName: 'Constellation',
  },
  vortex: {
    id: 'vortex',
    tier: 'large',
    duration: 2.4,
    temporaryScale: temporaryAttackScale.largeGift,
    permanentGrowth: 0.024,
    cameraShake: 0.34,
    soundId: 'vortex',
    attackType: 'tornado',
    rarity: 'large',
    shake: 'medium',
    impacts: [0.34, 0.58, 0.82],
    giftName: 'Whirlwind',
  },
  planet: {
    id: 'planet',
    tier: 'legendary',
    duration: 2.5,
    temporaryScale: temporaryAttackScale.legendaryGift,
    permanentGrowth: 0.032,
    cameraShake: 0.5,
    soundId: 'planet',
    attackType: 'cosmic',
    rarity: 'legendary',
    shake: 'large',
    impacts: [0.62, 0.84],
    giftName: 'Galaxy',
  },
  crystal: {
    id: 'crystal',
    tier: 'legendary',
    duration: 2.8,
    temporaryScale: temporaryAttackScale.legendaryGift,
    permanentGrowth: 0.034,
    cameraShake: 0.55,
    soundId: 'crystal',
    attackType: 'laser',
    rarity: 'legendary',
    shake: 'large',
    impacts: [0.7],
    giftName: 'Prism',
  },
  eclipse: {
    id: 'eclipse',
    tier: 'legendary',
    duration: 4.4,
    temporaryScale: temporaryAttackScale.legendaryGift,
    permanentGrowth: 0.04,
    cameraShake: 0.62,
    soundId: 'eclipse',
    attackType: 'black_hole',
    rarity: 'legendary',
    shake: 'legendary',
    impacts: [0.42, 0.68, 0.9],
    giftName: 'TikTok Universe',
  },
}

const ORDER: AttackStyle[] = ['pulse', 'comet', 'portal', 'rose', 'maple', 'star', 'vortex', 'planet', 'crystal', 'eclipse']

export const attackStyles = ORDER

export function styleOf(command: Pick<AttackCommand, 'giftName' | 'attackType' | 'rarity'>): AttackStyle {
  const name = command.giftName.trim().toLowerCase()
  if (name === 'like' || name === 'comment' || name === 'tiktok' || name === 'gg') return 'pulse'
  if (name === 'follow' || name === 'sunglasses') return 'comet'
  if (name === 'share' || name === 'confetti' || name.includes('money')) return 'portal'
  if (name === 'rose' || name === 'rosa' || name === 'perfume' || name.includes('heart')) return 'rose'
  if (name.includes('maple') || name === 'blaze' || name === 'inferno' || name === 'doughnut') return 'maple'
  if (name.includes('constellation') || name.includes('sabre') || name.includes('aura') || name === 'thunder') return 'star'
  if (name === 'whirlwind' || name === 'thunderstorm' || name.includes('vortex')) return 'vortex'
  if (name === 'galaxy' || name === 'universe' || name === 'train' || name.includes('orbital')) return 'planet'
  if (name.includes('prism') || name.includes('crystal') || name.includes('ice cream')) return 'crystal'
  if (name === 'lion' || name.includes('tiktok universe') || name.includes('eclipse')) return 'eclipse'
  if (command.rarity === 'legendary') return 'eclipse'
  if (command.rarity === 'large') return 'maple'
  if (command.attackType === 'tornado') return 'vortex'
  if (command.attackType === 'beam' || command.attackType === 'laser' || command.attackType === 'sword') return 'star'
  if (command.attackType === 'rose') return 'rose'
  if (command.attackType === 'share_shot') return 'portal'
  if (command.attackType === 'follow_blast') return 'comet'
  return 'pulse'
}

export function motifOf(giftName: string): string {
  const name = giftName.trim().toLowerCase()
  if (name === 'tiktok') return 'note'
  if (name === 'gg') return 'stamp'
  if (name === 'comment') return 'spark'
  if (name === 'sunglasses') return 'visor'
  if (name === 'confetti') return 'confetti'
  if (name.includes('money')) return 'coin'
  if (name === 'perfume') return 'mist'
  if (name.includes('heart')) return 'heart'
  if (name === 'doughnut') return 'ring'
  if (name === 'inferno') return 'ember'
  if (name === 'thunder' || name === 'thunderstorm') return 'bolt'
  if (name === 'train') return 'convoy'
  if (name.includes('ice cream')) return 'shard'
  if (name === 'rosa') return 'bloom'
  return 'core'
}

export function scaleFor(style: AttackStyle): number {
  return styles[style].temporaryScale
}

export function growthFor(style: AttackStyle): number {
  return styles[style].permanentGrowth
}
