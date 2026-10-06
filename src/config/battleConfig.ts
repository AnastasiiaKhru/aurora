import { DESIGN_HEIGHT, MAX_ATTACK_Y, MAX_IMPACT_Y, MIN_ATTACK_Y } from '../broadcast/stage.ts'
import type { TeamAssignMode } from '../types/Team.ts'
import type { WinCondition } from '../types/Battle.ts'

export interface LikeThreshold {
  likes: number
  damage: number
  score: number
  intensity: number
}

export const battleConfig = {
  defaultDurationMs: 180_000,
  finalRushMs: 30_000,
  finalTenMs: 10_000,
  maxHealth: 120_000,
  winCondition: 'highest_score' as WinCondition,
  teamAssignMode: 'explicit' as TeamAssignMode,
  teamNames: { red: 'CANADA', blue: 'USA' },
  comboWindowMs: 2_400,
  comboMilestones: [2, 3, 5, 10, 25, 50, 100],
  likeScoreEach: 0.25,
  likeThresholds: [
    { likes: 100, damage: 90, score: 120, intensity: 0.45 },
    { likes: 500, damage: 520, score: 700, intensity: 0.75 },
    { likes: 1_000, damage: 1_400, score: 1_600, intensity: 1.05 },
  ] satisfies LikeThreshold[],
  followScore: 30,
  likeShotDamage: 6,
  followBlastDamage: 48,
  followHit: 55,
  shareDamage: 90,
  shareHit: 62,
  commentDamage: 14,
  playerHealth: 100,
  playerDeathSeconds: 1.08,
  playTop: MIN_ATTACK_Y / DESIGN_HEIGHT,
  playBottom: MAX_ATTACK_Y / DESIGN_HEIGHT,
  floorTop: MAX_IMPACT_Y / DESIGN_HEIGHT,
  shareScore: 50,
  rushUniqueGifters: 4,
  rushWindowMs: 3_000,
  rushDurationMs: 5_200,
  maxFeed: 3,
  legendaryWindupMs: 720,
  finishingMs: 1_500,
  victoryHoldMs: 11_000,
  riftMaxShift: 0.1,
  initialPlayersPerTeam: 12,
  rosterRed: 12,
  rosterBlue: 12,
  maxCombatParticles: 820,
  maxAmbientParticles: 260,
}
