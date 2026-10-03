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
  teamNames: { red: 'RED', blue: 'BLUE' },
  comboWindowMs: 2_400,
  comboMilestones: [2, 3, 5, 10, 25, 50, 100],
  likeScoreEach: 0.25,
  likeThresholds: [
    { likes: 100, damage: 90, score: 120, intensity: 0.45 },
    { likes: 500, damage: 520, score: 700, intensity: 0.75 },
    { likes: 1_000, damage: 1_400, score: 1_600, intensity: 1.05 },
  ] satisfies LikeThreshold[],
  followScore: 30,
  shareScore: 50,
  rushUniqueGifters: 4,
  rushWindowMs: 3_000,
  rushDurationMs: 5_200,
  maxFeed: 5,
  giftAggregateMs: 90,
  legendaryWindupMs: 720,
  finishingMs: 1_500,
  riftMaxShift: 0.1,
  initialPlayersPerTeam: 20,
  maxActiveEffects: 16,
  maxCombatParticles: 820,
  maxAmbientParticles: 260,
}
