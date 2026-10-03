import type { AttackType, GiftRarity, ShakeLevel, SoundEffectId } from './Gift.ts'
import type { LeaderboardEntry } from './Player.ts'
import type { TeamAssignMode, TeamId, TeamState } from './Team.ts'
import type { BattleFeedItem } from './Events.ts'

export type BattleStatus = 'running' | 'paused' | 'finishing' | 'finished'
export type TimerPhase = 'normal' | 'final_rush' | 'final_10' | 'finished'
export type WinCondition = 'highest_score' | 'destroy_territory'
export type VictoryResult = 'red' | 'blue' | 'draw'

export interface ComboCallout {
  id: string
  username: string
  team: TeamId
  count: number
  giftName: string
  icon: string
  life: number
}

export interface Announcement {
  id: string
  username: string
  avatarUrl: string
  team: TeamId
  title: string
  subtitle: string
  icon: string
  image?: string
  rarity: GiftRarity
  life: number
}

export interface RushCallout {
  id: string
  team: TeamId
  label: string
}

export interface VictoryState {
  result: VictoryResult
  redScore: number
  blueScore: number
  mvp: LeaderboardEntry | null
  top: LeaderboardEntry[]
}

export interface HudSnapshot {
  status: BattleStatus
  phase: TimerPhase
  endless: boolean
  elapsedMs: number
  timeLeftMs: number
  durationMs: number
  red: TeamState
  blue: TeamState
  feed: BattleFeedItem[]
  combos: ComboCallout[]
  announcement: Announcement | null
  rush: RushCallout | null
  leaderboard: LeaderboardEntry[]
  victory: VictoryState | null
  muted: boolean
  selected: LeaderboardEntry | null
  winCondition: WinCondition
  teamAssignMode: TeamAssignMode
  finalTen: { value: number; nonce: number } | null
  epoch: number
}

export interface AttackCommand {
  id: number
  attackType: AttackType
  team: TeamId
  fromX: number
  fromY: number
  toX: number
  toY: number
  intensity: number
  duration: number
  damage: number
  shake: ShakeLevel
  particleIntensity: number
  sound: SoundEffectId
  priority: number
  username: string
  giftName: string
  combo: number
  rarity: GiftRarity
  impacts: number[]
}
