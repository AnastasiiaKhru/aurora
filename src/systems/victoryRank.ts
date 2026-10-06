import type { VictoryResult } from '../types/Battle.ts'
import type { LeaderboardEntry } from '../types/Player.ts'
import { isGeneratedId, isNpcId } from './attractMode.ts'

/**
 * Top contributors from the round that just finished.
 * Both countries qualify. NPCs never qualify.
 * Field fillers qualify only after a real viewer action marked them as participants.
 */
export function rankVictory(entries: LeaderboardEntry[], _winner: VictoryResult): LeaderboardEntry[] {
  return entries
    .filter((entry) => entry.battlePoints > 0 && !isNpcId(entry.id) && (entry.participated === true || !isGeneratedId(entry.id)))
    .sort((a, b) => b.battlePoints - a.battlePoints || b.giftValue - a.giftValue || b.damageDealt - a.damageDealt)
    .slice(0, 3)
}
