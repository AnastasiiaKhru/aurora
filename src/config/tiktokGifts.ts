import type {
  AttackType,
  GiftRarity,
  ShakeLevel,
  SoundEffectId,
  TikTokGift,
} from '../types/Gift.ts'

/**
 * Starter TikTok LIVE gift catalog.
 * Coin values, names, and availability change by account, region, and time.
 * Replace this list with the live catalog when a TikTok provider is connected.
 * Unknown gifts are resolved by coin value through `resolveGift`.
 */
const intensity: Record<GiftRarity, number> = {
  micro: 0.38,
  small: 0.55,
  medium: 0.78,
  large: 1.05,
  legendary: 1.45,
}

const duration: Record<GiftRarity, number> = {
  micro: 680,
  small: 920,
  medium: 1_250,
  large: 1_750,
  legendary: 2_450,
}

const shake: Record<GiftRarity, ShakeLevel> = {
  micro: 'none',
  small: 'none',
  medium: 'small',
  large: 'large',
  legendary: 'legendary',
}

const soundFor: Record<AttackType, SoundEffectId> = {
  energy_bullet: 'projectile',
  sparkle_shot: 'projectile',
  rose: 'projectile',
  heart: 'magic',
  fireball: 'fire',
  lightning: 'electricity',
  magic: 'magic',
  rocket: 'rocket',
  missile: 'rocket',
  beam: 'magic',
  fire_blast: 'fire',
  tornado: 'tornado',
  airstrike: 'explosion',
  laser: 'electricity',
  thunderstorm: 'electricity',
  meteor: 'meteor',
  dragon: 'fire',
  black_hole: 'meteor',
  cosmic: 'magic',
  sword: 'whoosh',
  firestorm: 'fire',
  pulse: 'whoosh',
  follow_blast: 'explosion',
  share_shot: 'projectile',
  ice: 'magic',
}

export function categorizeByValue(coins: number): GiftRarity {
  if (coins >= 5_000) return 'legendary'
  if (coins >= 500) return 'large'
  if (coins >= 100) return 'medium'
  if (coins >= 10) return 'small'
  return 'micro'
}

interface GiftDraft {
  id: string
  name: string
  displayName?: string
  coinValue: number
  icon: string
  image?: string
  attackType: AttackType
  baseDamage: number
  rarity?: GiftRarity
  animationIntensity?: number
  comboEligible?: boolean
  duration?: number
  screenShake?: ShakeLevel
  particleIntensity?: number
  soundEffect?: SoundEffectId
  scoreValue?: number
}

function gift(draft: GiftDraft): TikTokGift {
  const rarity = draft.rarity ?? categorizeByValue(draft.coinValue)
  return {
    id: draft.id,
    name: draft.name,
    displayName: draft.displayName ?? draft.name,
    coinValue: draft.coinValue,
    icon: draft.icon,
    image: draft.image,
    rarity,
    attackType: draft.attackType,
    baseDamage: draft.baseDamage,
    scoreValue: draft.scoreValue ?? draft.coinValue,
    animationIntensity: draft.animationIntensity ?? intensity[rarity],
    comboEligible: draft.comboEligible ?? (rarity === 'micro' || rarity === 'small'),
    duration: draft.duration ?? duration[rarity],
    screenShake: draft.screenShake ?? shake[rarity],
    particleIntensity: draft.particleIntensity ?? intensity[rarity],
    soundEffect: draft.soundEffect ?? soundFor[draft.attackType],
  }
}

export const tiktokGifts: TikTokGift[] = [
  gift({ id: 'rose', name: 'Rose', coinValue: 1, icon: '🌹', image: '/gifts/rose.webp', attackType: 'rose', baseDamage: 18 }),
  gift({ id: 'tiktok', name: 'TikTok', coinValue: 1, icon: '♪', image: '/gifts/tiktok.webp', attackType: 'energy_bullet', baseDamage: 16 }),
  gift({ id: 'gg', name: 'GG', coinValue: 1, icon: 'GG', image: '/gifts/gg.webp', attackType: 'sparkle_shot', baseDamage: 16 }),
  gift({ id: 'ice_cream', name: 'Ice Cream Cone', coinValue: 1, icon: '🍦', image: '/gifts/ice_cream.webp', attackType: 'sparkle_shot', baseDamage: 16 }),
  gift({ id: 'finger_heart', name: 'Finger Heart', coinValue: 5, icon: '♥', image: '/gifts/finger_heart.webp', attackType: 'heart', baseDamage: 42 }),
  gift({ id: 'rosa', name: 'Rosa', coinValue: 10, icon: '🌹', image: '/gifts/rosa.webp', attackType: 'rose', baseDamage: 78, animationIntensity: 0.62 }),
  gift({ id: 'perfume', name: 'Perfume', coinValue: 20, icon: '✿', image: '/gifts/perfume.webp', attackType: 'magic', baseDamage: 130 }),
  gift({ id: 'doughnut', name: 'Doughnut', coinValue: 30, icon: '🍩', image: '/gifts/doughnut.webp', attackType: 'fireball', baseDamage: 190 }),
  gift({ id: 'hand_hearts', name: 'Hand Hearts', coinValue: 100, icon: '♥', image: '/gifts/hand_hearts.webp', attackType: 'heart', baseDamage: 720, animationIntensity: 0.9 }),
  gift({ id: 'confetti', name: 'Confetti', coinValue: 100, icon: '✦', image: '/gifts/confetti.webp', attackType: 'sparkle_shot', baseDamage: 680, particleIntensity: 1.1 }),
  gift({ id: 'aura_beam', name: 'Aura Beam', coinValue: 199, icon: '▬', image: '/gifts/aura_beam.webp', attackType: 'beam', baseDamage: 1_250 }),
  gift({ id: 'sunglasses', name: 'Sunglasses', coinValue: 199, icon: '🕶', image: '/gifts/sunglasses.webp', attackType: 'rocket', baseDamage: 1_450 }),
  gift({ id: 'thunder', name: 'Thunder', coinValue: 299, icon: '⚡', image: '/gifts/thunder.webp', attackType: 'lightning', baseDamage: 1_900, duration: 620 }),
  gift({ id: 'blaze', name: 'Blaze', coinValue: 450, icon: '▲', image: '/gifts/blaze.webp', attackType: 'fire_blast', baseDamage: 2_600 }),
  gift({ id: 'money_gun', name: 'Money Gun', coinValue: 500, icon: '✧', image: '/gifts/money_gun.webp', attackType: 'missile', baseDamage: 3_400 }),
  gift({ id: 'train', name: 'Train', coinValue: 899, icon: '🚂', image: '/gifts/train.webp', attackType: 'airstrike', baseDamage: 5_400 }),
  gift({ id: 'galaxy', name: 'Galaxy', coinValue: 1_000, icon: '✶', image: '/gifts/galaxy.webp', attackType: 'cosmic', baseDamage: 7_200, animationIntensity: 1.2 }),
  gift({ id: 'whirlwind', name: 'Whirlwind', coinValue: 1_200, icon: '◌', image: '/gifts/whirlwind.webp', attackType: 'tornado', baseDamage: 7_800, duration: 2_800 }),
  gift({ id: 'prism', name: 'Prism Laser', coinValue: 1_800, icon: '◆', image: '/gifts/prism.webp', attackType: 'laser', baseDamage: 9_200, duration: 1_400 }),
  gift({ id: 'storm', name: 'Thunderstorm', coinValue: 2_200, icon: '⚡', image: '/gifts/storm.webp', attackType: 'thunderstorm', baseDamage: 11_000, duration: 1_900 }),
  gift({ id: 'inferno', name: 'Inferno', coinValue: 2_600, icon: '🔥', image: '/gifts/inferno.webp', attackType: 'firestorm', baseDamage: 12_500, duration: 2_100 }),
  gift({ id: 'sabre', name: 'Star Sabre', coinValue: 3_000, icon: '✦', image: '/gifts/sabre.webp', attackType: 'sword', baseDamage: 13_500, duration: 1_350, soundEffect: 'whoosh' }),
  gift({ id: 'lion', name: 'Lion', coinValue: 29_999, icon: '♛', image: '/gifts/lion.webp', attackType: 'dragon', baseDamage: 24_000, duration: 2_600 }),
  gift({ id: 'universe', name: 'Universe', coinValue: 34_999, icon: '✹', image: '/gifts/universe.webp', attackType: 'meteor', baseDamage: 28_000, duration: 2_300 }),
  gift({
    id: 'tiktok_universe',
    name: 'TikTok Universe',
    coinValue: 44_999,
    icon: '◉',
    image: '/gifts/tiktok_universe.webp',
    attackType: 'black_hole',
    baseDamage: 34_000,
    duration: 2_700,
  }),
]

const byId = new Map(tiktokGifts.map((giftDef) => [giftDef.id, giftDef]))
const byName = new Map(tiktokGifts.map((giftDef) => [giftDef.name.toLowerCase(), giftDef]))

const fallbackAttack: Record<GiftRarity, AttackType> = {
  micro: 'energy_bullet',
  small: 'magic',
  medium: 'rocket',
  large: 'cosmic',
  legendary: 'meteor',
}

const fallbackDamage: Record<GiftRarity, number> = {
  micro: 20,
  small: 140,
  medium: 1_200,
  large: 6_000,
  legendary: 22_000,
}

export function resolveGift(giftId: string, giftName?: string, coinValue?: number): TikTokGift {
  const known = byId.get(giftId) ?? (giftName ? byName.get(giftName.toLowerCase()) : undefined)
  if (known) {
    if (coinValue == null || coinValue === known.coinValue) return known
    return { ...known, coinValue, scoreValue: coinValue }
  }

  const coins = Math.max(0, coinValue ?? 1)
  const rarity = categorizeByValue(coins)
  const attackType = fallbackAttack[rarity]
  const label = giftName?.trim() || 'Gift'
  return {
    id: giftId || `unknown-${coins}`,
    name: label,
    displayName: label,
    coinValue: coins,
    icon: '✦',
    rarity,
    attackType,
    baseDamage: Math.max(fallbackDamage[rarity], Math.round(coins * 0.85)),
    scoreValue: coins,
    animationIntensity: intensity[rarity],
    comboEligible: rarity === 'micro' || rarity === 'small',
    duration: duration[rarity],
    screenShake: shake[rarity],
    particleIntensity: intensity[rarity],
    soundEffect: soundFor[attackType],
  }
}

export function getGiftById(id: string): TikTokGift | undefined {
  return byId.get(id)
}
