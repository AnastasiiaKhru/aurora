import { MemberMessageAction, type User, type WebcastChatMessage, type WebcastGiftMessage, type WebcastLikeMessage, type WebcastMemberMessage, type WebcastSocialMessage } from 'tiktok-live-connector'
import type { CatalogGift, ChatPayload, GiftPayload, LikePayload, ViewerPayload } from './types.ts'
import type { SessionTeams } from './teams.ts'

export interface GiftDecision {
  kind: 'streak' | 'final'
  username: string
  giftName: string
  count: number
  payload?: GiftPayload
}

export class GiftStreaks {
  private readonly progress = new Map<string, number>()
  private readonly emitted = new Map<string, number>()
  private readonly finished = new Set<string>()

  decide(message: WebcastGiftMessage, teams: SessionTeams, catalog: Map<string, CatalogGift>): GiftDecision | null {
    const person = viewerFromUser(message.user, teams)
    if (!person) return null
    const listed = catalog.get(String(message.giftId))
    const extended = readExtended(message.extendedGiftInfo)
    const giftType = message.gift?.type ?? listed?.giftType ?? extended?.giftType
    const giftName = message.gift?.name || listed?.name || extended?.name || `Gift ${message.giftId}`
    const count = message.repeatCount > 0 ? message.repeatCount : 1
    const streakKey = `${person.userId}|${message.giftId}|${message.groupId || 'open'}`
    const diamonds = positive(message.gift?.diamondCount) ?? listed?.diamondCount ?? extended?.diamondCount
    const image = firstUrl(message.gift?.image?.urlList) || listed?.imageUrl || extended?.imageUrl || undefined
    const base = {
      ...person,
      giftId: String(message.giftId || message.gift?.id || 'unknown'),
      giftName,
      ...(diamonds != null ? { coinValue: diamonds } : {}),
      ...(image ? { image } : {}),
    }

    if (giftType === 1 && message.repeatEnd === 0) {
      const previous = this.emitted.get(streakKey) ?? 0
      const delta = Math.max(0, count - previous)
      this.progress.set(streakKey, count)
      this.emitted.set(streakKey, count)
      if (delta <= 0) return { kind: 'streak', username: person.username, giftName, count }
      const payload: GiftPayload = { ...base, giftCount: delta, repeatEnd: false, preview: true }
      return { kind: 'final', username: person.username, giftName, count: delta, payload }
    }

    if (giftType === 1) {
      if (this.finished.has(streakKey)) return null
      this.finished.add(streakKey)
    }

    const finalCount = giftType === 1 ? Math.max(count, this.progress.get(streakKey) ?? 1) : count
    const shown = giftType === 1 ? (this.emitted.get(streakKey) ?? 0) : 0
    this.progress.delete(streakKey)
    this.emitted.delete(streakKey)
    const payload: GiftPayload = {
      ...base,
      giftCount: finalCount,
      visualCount: Math.max(0, finalCount - shown),
      repeatEnd: true,
    }
    return { kind: 'final', username: person.username, giftName, count: finalCount, payload }
  }
}

export function memberJoin(message: WebcastMemberMessage, teams: SessionTeams): ViewerPayload | null {
  if (message.action !== MemberMessageAction.MEMBER_MESSAGE_ACTION_JOINED && message.action !== MemberMessageAction.MEMBER_MESSAGE_ACTION_UNKNOWN) {
    return null
  }
  return viewerFromUser(message.user, teams)
}

export function likeFrom(message: WebcastLikeMessage, teams: SessionTeams): LikePayload | null {
  const person = viewerFromUser(message.user, teams)
  if (!person) return null
  return { ...person, count: likeCount(message) }
}

export function chatFrom(message: WebcastChatMessage, teams: SessionTeams): ChatPayload | null {
  const person = viewerFromUser(message.user, teams)
  const text = (message.content ?? '').trim()
  if (!person || !text) return null
  teams.teamFor(person.userId)
  return { userId: person.userId, username: person.username, avatarUrl: person.avatarUrl, text }
}

export function socialFrom(message: WebcastSocialMessage, teams: SessionTeams, kind: 'follow' | 'share' | 'other'): ViewerPayload | null {
  if (kind === 'other') return null
  return viewerFromUser(message.user, teams)
}

export function classifySocial(message: WebcastSocialMessage): 'follow' | 'share' | 'other' {
  const hint = socialHint(message)
  const shared =
    hint.includes('share') ||
    asText(message.shareType).length > 0 ||
    asText(message.shareTarget).length > 0 ||
    (typeof message.shareCount === 'number' && message.shareCount > 0)
  const followed = hint.includes('follow') || (typeof message.followType === 'number' && message.followType > 0)
  if (followed) return 'follow'
  if (shared) return 'share'
  return 'other'
}

export function viewerKey(user: User | undefined): string {
  if (!user) return ''
  return asText(user.id) || asText(user.displayId) || asText(user.nickname)
}

export function readCatalog(raw: unknown): CatalogGift[] {
  const rows = giftRows(raw)
  const gifts: CatalogGift[] = []
  for (const row of rows) {
    const id = row.id
    if (typeof id !== 'string' && typeof id !== 'number') continue
    const name = typeof row.name === 'string' ? row.name : ''
    gifts.push({
      id: String(id),
      name,
      diamondCount: numberField(row.diamond_count) ?? numberField(row.diamondCount),
      giftType: numberField(row.type) ?? numberField(row.gift_type) ?? numberField(row.giftType),
      imageUrl: imageFrom(row.image) ?? imageFrom(row.icon),
    })
  }
  return gifts
}

function largestAvatar(user: User): string {
  const sized = user as User & { avatarLarger?: { urlList?: string[] } }
  return firstUrl(sized.avatarLarger?.urlList) || firstUrl(user.avatarMedium?.urlList) || firstUrl(user.avatarThumb?.urlList)
}

function viewerFromUser(user: User | undefined, teams: SessionTeams): ViewerPayload | null {
  const userId = viewerKey(user)
  if (!user || !userId) return null
  const username = asText(user.displayId) || asText(user.nickname) || 'viewer'
  return {
    userId,
    username,
    avatarUrl: largestAvatar(user),
    team: teams.teamFor(userId),
  }
}

function likeCount(message: WebcastLikeMessage): number {
  if (typeof message.count === 'number' && message.count > 0) return message.count
  const effect = Number(message.effectCnt)
  if (Number.isFinite(effect) && effect > 0 && effect <= 30) return effect
  return 1
}

function socialHint(message: WebcastSocialMessage): string {
  const parts = [asText(message.action)]
  const text = message.common?.displayText
  if (text) {
    parts.push(asText(text.key), asText(text.defaultPattern))
    for (const piece of text.pieces ?? []) parts.push(asText(piece.stringValue))
  }
  return parts.join(' ').toLowerCase()
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function readExtended(value: unknown): { name?: string; diamondCount?: number; giftType?: number; imageUrl?: string } | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const name = typeof row.name === 'string' ? row.name : undefined
  return {
    name,
    diamondCount: numberField(row.diamond_count) ?? numberField(row.diamondCount),
    giftType: numberField(row.type) ?? numberField(row.gift_type) ?? numberField(row.giftType),
    imageUrl: imageFrom(row.image) ?? imageFrom(row.icon),
  }
}

function giftRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter(isRecord)
  if (!isRecord(raw)) return []
  for (const key of ['gifts', 'gift_list', 'giftList']) {
    const value = raw[key]
    if (Array.isArray(value)) return value.filter(isRecord)
  }
  return []
}

function imageFrom(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const list = value.url_list ?? value.urlList
  if (!Array.isArray(list)) return undefined
  const url = list.find((item) => typeof item === 'string' && item.length > 0)
  return typeof url === 'string' ? url : undefined
}

function numberField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function positive(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value < 0) return undefined
  return value
}

function firstUrl(list: string[] | undefined): string {
  return list?.find((url) => url.length > 0) ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
