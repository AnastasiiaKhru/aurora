import type { AttackCommand, Announcement, ComboCallout, VictoryState } from '../types/Battle.ts'
import type { BattleFeedItem } from '../types/Events.ts'
import type { Player } from '../types/Player.ts'
import type { PlayerBody } from './PlayerSystem.ts'
import type { TeamAssignMode, TeamId, TeamState } from '../types/Team.ts'
import type { WinCondition, BattleStatus, TimerPhase } from '../types/Battle.ts'
import type { TikTokLiveEvent } from '../integrations/tiktok/TikTokEventTypes.ts'
import type { ComboSave } from './ComboSystem.ts'
import type { MomentumSave } from './MomentumSystem.ts'

const STATE_KEY = 'aurora.battle.v1'
const LOCK_KEY = 'aurora.battle.lock'
const CHANNEL_NAME = 'aurora-battle'
export const LOCK_TTL_MS = 1_200

export interface BattleCore {
  status: BattleStatus
  endless: boolean
  elapsedMs: number
  durationMs: number
  timeLeftMs: number
  phase: TimerPhase
  winCondition: WinCondition
  victory: VictoryState | null
  finishingLeft: number
  finalTen: { value: number; nonce: number } | null
  victoryElapsed: number
  victoryEndsAt?: number
  red: TeamState
  blue: TeamState
}

export interface RosterMember {
  id: string
  username: string
  avatarUrl: string
  avatarKey: string
  initials: string
  team: TeamId
}

export interface BattleSave {
  revision: number
  savedAt: number
  owner: string
  core: BattleCore
  roundId: string
  roundStartedAt: number
  nextRoundWall: number
  activatedRound: string
  countdown: { token: string; label: string; level: number } | null
  teamAssignMode: TeamAssignMode
  epoch: number
  muted: boolean
  players: Player[]
  bodies: PlayerBody[]
  feed: BattleFeedItem[]
  callouts: ComboCallout[]
  announcement: Announcement | null
  rush: { id: string; team: 'red' | 'blue'; label: string } | null
  combos: ComboSave[]
  momentum: MomentumSave | null
  roundNumber?: number
  combatRound?: number
  countdownKind?: 'opening' | 'next'
  roster?: RosterMember[]
  choices?: { key: string; team: TeamId }[]
}

export type SyncCommand =
  | { name: 'reset' }
  | { name: 'stop' }
  | { name: 'pause' }
  | { name: 'start' }
  | { name: 'mute' }
  | { name: 'preview' }
  | { name: 'forever' }
  | { name: 'duration'; seconds: number }
  | { name: 'jump'; ms: number }
  | { name: 'win'; condition: WinCondition }
  | { name: 'assign'; mode: TeamAssignMode }
  | { name: 'crowd'; count: number; team?: 'red' | 'blue' }
  | { name: 'end'; winner: 'red' | 'blue' | 'draw' }
  | { name: 'skipVictory' }
  | { name: 'resetRound' }

export type BattleMessage =
  | { type: 'state'; save: BattleSave }
  | { type: 'attack'; command: AttackCommand; delayMs: number }
  | { type: 'command'; command: SyncCommand }
  | { type: 'event'; event: TikTokLiveEvent }

interface LockStamp {
  id: string
  at: number
}

type Listener = (message: BattleMessage) => void

export function readBattle(): BattleSave | null {
  return readJson<BattleSave>(STATE_KEY, isSave)
}

export function readLock(): LockStamp | null {
  return readJson<LockStamp>(LOCK_KEY, isLock)
}

export function writeBattle(save: BattleSave, broadcast: boolean): void {
  writeJson(STATE_KEY, save)
  if (broadcast) post({ type: 'state', save })
}

export function claimLock(id: string): void {
  writeJson(LOCK_KEY, { id, at: Date.now() } satisfies LockStamp)
}

export function releaseLock(id: string): void {
  const lock = readLock()
  if (lock && lock.id !== id) return
  writeJson(LOCK_KEY, { id, at: 0 } satisfies LockStamp)
}

export function postBattle(message: BattleMessage): void {
  post(message)
}

let sharedChannel: BroadcastChannel | null = null

function battleBus(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!sharedChannel) sharedChannel = new BroadcastChannel(CHANNEL_NAME)
  return sharedChannel
}

export function subscribeBattle(listener: Listener): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onMessage = (event: MessageEvent<BattleMessage>) => {
    if (!event.data || typeof event.data !== 'object') return
    listener(event.data)
  }
  const channel = battleBus()
  channel?.addEventListener('message', onMessage)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STATE_KEY || !event.newValue) return
    try {
      const save = JSON.parse(event.newValue) as BattleSave
      if (isSave(save)) listener({ type: 'state', save })
    } catch {
      // Ignore a bad snapshot from another tab.
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    channel?.removeEventListener('message', onMessage)
    window.removeEventListener('storage', onStorage)
  }
}

function post(message: BattleMessage): void {
  battleBus()?.postMessage(message)
}

function readJson<T>(key: string, guard: (value: unknown) => value is T): T | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return guard(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode can reject storage. The open tab still keeps the live match.
  }
}

function isLock(value: unknown): value is LockStamp {
  if (!value || typeof value !== 'object') return false
  const stamp = value as LockStamp
  return typeof stamp.id === 'string' && typeof stamp.at === 'number'
}

function isSave(value: unknown): value is BattleSave {
  if (!value || typeof value !== 'object') return false
  const save = value as BattleSave
  return typeof save.revision === 'number' && typeof save.savedAt === 'number' && !!save.core && Array.isArray(save.players)
}
