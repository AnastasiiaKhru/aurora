export type GiftRarity = 'micro' | 'small' | 'medium' | 'large' | 'legendary'

export type AttackType =
  | 'energy_bullet'
  | 'sparkle_shot'
  | 'rose'
  | 'heart'
  | 'fireball'
  | 'lightning'
  | 'magic'
  | 'rocket'
  | 'missile'
  | 'beam'
  | 'fire_blast'
  | 'tornado'
  | 'airstrike'
  | 'laser'
  | 'thunderstorm'
  | 'meteor'
  | 'dragon'
  | 'black_hole'
  | 'cosmic'
  | 'sword'
  | 'firestorm'
  | 'pulse'
  | 'follow_blast'
  | 'share_shot'
  | 'ice'

export type ShakeLevel = 'none' | 'small' | 'medium' | 'large' | 'legendary'

export type SoundEffectId =
  | 'small_hit'
  | 'projectile'
  | 'rocket'
  | 'explosion'
  | 'fire'
  | 'electricity'
  | 'tornado'
  | 'meteor'
  | 'combo'
  | 'countdown'
  | 'victory'
  | 'magic'
  | 'whoosh'

export interface TikTokGift {
  id: string
  name: string
  displayName: string
  coinValue: number
  icon: string
  image?: string
  rarity: GiftRarity
  attackType: AttackType
  baseDamage: number
  scoreValue: number
  animationIntensity: number
  comboEligible: boolean
  duration: number
  screenShake: ShakeLevel
  particleIntensity: number
  soundEffect: SoundEffectId
}
