import { MemberMessageAction, type User, type WebcastChatMessage, type WebcastGiftMessage, type WebcastLikeMessage, type WebcastMemberMessage, type WebcastSocialMessage } from 'tiktok-live-connector'
import type { CatalogGift, ChatPayload, GiftPayload, LikePayload, LiveWireEvent, TeamId, ViewerPayload, WireGift, WireLike, WireSocial } from './types.ts'
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

/** TikTok LIVE 2.5 puts the text on `content`; older payloads use `comment`. */
export function commentOf(message: { content?: unknown; comment?: unknown; text?: unknown }): string {
  return asText(message.comment) || asText(message.content) || asText(message.text)
}

export function chatFrom(message: WebcastChatMessage, teams: SessionTeams): ChatPayload | null {
  const person = viewerFromUser(message.user, teams)
  const text = commentOf(message)
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
  const record = user as User & { userId?: unknown; uniqueId?: unknown; secUid?: unknown }
  return asText(user.id) || asText(record.userId) || asText(record.uniqueId) || asText(record.secUid) || asText(user.displayId) || asText(user.nickname)
}

export function uniqueIdOf(user: User | undefined): string {
  if (!user) return ''
  const record = user as User & { uniqueId?: unknown }
  return asText(record.uniqueId) || asText(user.displayId)
}

export function usernameOf(user: User | undefined): string {
  if (!user) return ''
  return uniqueIdOf(user) || asText(user.nickname) || viewerKey(user)
}

let eventSeq = 0

export function nextEventId(): string {
  eventSeq += 1
  return `live-${Date.now().toString(36)}-${eventSeq.toString(36)}`
}

export function wireChat(chat: ChatPayload): LiveWireEvent {
  return {
    type: 'chat',
    userId: chat.userId,
    username: chat.username,
    comment: chat.text,
    avatarUrl: chat.avatarUrl,
    eventId: nextEventId(),
  }
}

export function wireLike(like: LikePayload): WireLike {
  return {
    type: 'like',
    userId: like.userId,
    username: like.username,
    count: like.count,
    avatarUrl: like.avatarUrl,
    team: like.team,
    eventId: nextEventId(),
  }
}

export function wireGift(gift: GiftPayload): WireGift {
  return {
    type: 'gift',
    userId: gift.userId,
    username: gift.username,
    avatarUrl: gift.avatarUrl,
    team: gift.team,
    giftName: gift.giftName,
    giftId: numericId(gift.giftId),
    diamonds: gift.coinValue ?? 0,
    repeatCount: gift.giftCount,
    repeatEnd: gift.repeatEnd !== false,
    ...(gift.preview ? { preview: true } : {}),
    ...(gift.visualCount != null ? { visualCount: gift.visualCount } : {}),
    ...(gift.image ? { image: gift.image } : {}),
    eventId: nextEventId(),
  }
}

export function wireSocial(kind: 'follow' | 'share' | 'join', viewer: ViewerPayload, explicit = false): WireSocial {
  return {
    type: kind,
    userId: viewer.userId,
    username: viewer.username,
    avatarUrl: viewer.avatarUrl,
    team: viewer.team,
    ...(explicit ? { explicit: true } : {}),
    eventId: nextEventId(),
  }
}

export function injectWire(raw: unknown): LiveWireEvent | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') return null
  const userId = asText(raw.userId)
  const username = asText(raw.username) || 'viewer'
  if (!userId) return null
  const avatarUrl = typeof raw.avatarUrl === 'string' ? raw.avatarUrl : ''
  const eventId = asText(raw.eventId) || nextEventId()
  const team = readTeam(raw.team)
  if (raw.type === 'chat') {
    const comment = typeof raw.comment === 'string' ? raw.comment : typeof raw.text === 'string' ? raw.text : ''
    if (!comment.trim()) return null
    return { type: 'chat', userId, username, comment, avatarUrl, eventId }
  }
  if (raw.type === 'like') {
    return { type: 'like', userId, username, avatarUrl, count: positiveCount(raw.count), ...(team ? { team } : {}), eventId }
  }
  if (raw.type === 'gift') {
    const giftName = asText(raw.giftName) || 'Gift'
    const giftId = numericId(raw.giftId)
    const diamonds = finite(raw.diamonds) ?? finite(raw.coinValue) ?? 0
    const repeatCount = Math.max(1, Math.round(finite(raw.repeatCount) ?? finite(raw.giftCount) ?? 1))
    return {
      type: 'gift',
      userId,
      username,
      avatarUrl,
      giftName,
      giftId,
      diamonds,
      repeatCount,
      repeatEnd: raw.repeatEnd !== false && raw.preview !== true,
      ...(raw.preview === true ? { preview: true, repeatEnd: false } : {}),
      ...(team ? { team } : {}),
      ...(finite(raw.visualCount) != null ? { visualCount: finite(raw.visualCount) } : {}),
      ...(typeof raw.image === 'string' && raw.image ? { image: raw.image } : {}),
      eventId,
    }
  }
  if (raw.type === 'follow' || raw.type === 'share' || raw.type === 'join') {
    return {
      type: raw.type,
      userId,
      username,
      avatarUrl,
      ...(team ? { team } : {}),
      ...(raw.explicit === true ? { explicit: true } : {}),
      eventId,
    }
  }
  return null
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
  const username = usernameOf(user) || 'viewer'
  return {
    userId,
    username,
    avatarUrl: largestAvatar(user),
    team: teams.teamFor(userId),
  }
}

function likeCount(message: WebcastLikeMessage): number {
  const incremental = Number(message.count)
  if (Number.isFinite(incremental) && incremental > 0) return Math.round(incremental)
  const effect = Number(message.effectCnt)
  if (Number.isFinite(effect) && effect > 0 && effect <= 30) return Math.round(effect)
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
  if (typeof value === 'bigint') return value.toString()
  if (value && typeof value === 'object' && 'low' in value && 'high' in value) {
    const text = String(value)
    if (text && text !== '[object Object]') return text.trim()
  }
  return ''
}

function finite(value: unknown): number | undefined {
  const count = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  if (!Number.isFinite(count)) return undefined
  return count
}

function positiveCount(value: unknown): number {
  const count = finite(value)
  if (count == null || count <= 0) return 1
  return Math.min(500, Math.round(count))
}

function numericId(value: unknown): number | string {
  const text = asText(value)
  if (/^\d+$/.test(text)) return Number(text)
  return text || 'unknown'
}

function readTeam(value: unknown): TeamId | undefined {
  if (value === 'red' || value === 'canada') return 'red'
  if (value === 'blue' || value === 'usa') return 'blue'
  return undefined
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
