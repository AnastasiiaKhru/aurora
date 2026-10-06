export type GiftTier = 'small' | 'medium' | 'large' | 'vip'

export interface GiftPower {
  tier: GiftTier
  /** Temporary multiplier on the sender's circle while the attack fires. */
  growth: number
  /** Projectile draw scale; also drives impact particles and shockwave size. */
  size: number
  /** Multiplier on flight time. Bigger gifts travel faster. */
  pace: number
}

/** Power is driven by the total coins of the gift event (coin value × count). */
export function giftPower(coins: number): GiftPower {
  const value = Math.max(0, Number.isFinite(coins) ? coins : 0)
  if (value >= 5_000) {
    const extra = Math.min(1, Math.log10(value / 5_000))
    return { tier: 'vip', growth: 2.05 + extra * 0.25, size: 2.6 + extra * 0.6, pace: 0.82 }
  }
  if (value >= 500) return { tier: 'large', growth: 1.8, size: 2.1, pace: 0.88 }
  if (value >= 100) return { tier: 'medium', growth: 1.5, size: 1.7, pace: 0.94 }
  return { tier: 'small', growth: 1.25, size: 1.35 + Math.min(0.15, value / 600), pace: 1 }
}
