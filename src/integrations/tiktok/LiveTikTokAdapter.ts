import { shouldOpenSocket } from '../../preflight/rules.ts'
import { chatAction } from '../../utils/team.ts'
import type { TikTokAdapter } from './TikTokAdapter.ts'
import type { TikTokLiveEvent } from './TikTokEventTypes.ts'
import type { LiveChatPayload, LiveConnectionStatus, LiveLinkStatus } from './liveMessages.ts'

const DEFAULT_URL = 'ws://localhost:8080'

type LiveSender = (event: unknown) => boolean
const liveSenders = new Set<LiveSender>()

export function injectLiveTest(event: unknown): boolean {
  for (const send of liveSenders) {
    if (send(event)) return true
  }
  console.error('[WS ERROR]', 'Live socket is not open')
  return false
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __auroraLiveTest?: typeof injectLiveTest }).__auroraLiveTest = injectLiveTest
}

export function tiktokSocketUrl(): string {
  const configured = import.meta.env.VITE_TIKTOK_WS_URL
  return typeof configured === 'string' && configured.trim() ? configured.trim() : DEFAULT_URL
}

export class LiveTikTokAdapter implements TikTokAdapter {
  private readonly listeners = new Set<(event: TikTokLiveEvent) => void>()
  private readonly statusListeners = new Set<(status: LiveLinkStatus) => void>()
  private readonly chatListeners = new Set<(chat: LiveChatPayload) => void>()
  private readonly url: string
  private socket: WebSocket | null = null
  private stopped = true
  private retryMs = 1_000
  private timer = 0

  constructor(url: string) {
    this.url = url
  }

  start(): void {
    this.stopped = false
    this.open()
  }

  stop(): void {
    this.stopped = true
    window.clearTimeout(this.timer)
    this.timer = 0
    this.socket?.close()
  }

  on(listener: (event: TikTokLiveEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onStatus(listener: (status: LiveLinkStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onChat(listener: (chat: LiveChatPayload) => void): () => void {
    this.chatListeners.add(listener)
    return () => this.chatListeners.delete(listener)
  }

  private open(): void {
    if (!shouldOpenSocket(this.stopped, this.socket ? this.socket.readyState : null)) return
    this.emitStatus({ phase: 'connecting', username: '', roomId: '', detail: 'Connecting' })
    let socket: WebSocket
    try {
      socket = new WebSocket(this.url)
    } catch (error) {
      console.error('[WS ERROR]', error instanceof Error ? error.message : 'socket failed')
      console.log('[WS RECONNECTING]', this.url)
      this.schedule()
      return
    }
    this.socket = socket
    const sendTest: LiveSender = (event) => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return false
      socket.send(JSON.stringify({ type: 'debug_inject', event }))
      return true
    }
    socket.addEventListener('open', () => {
      liveSenders.add(sendTest)
      this.retryMs = 1_000
      console.log('[WS CONNECTED]', this.url)
    })
    socket.addEventListener('message', (event) => {
      void this.receive(event.data)
    })
    socket.addEventListener('close', () => {
      liveSenders.delete(sendTest)
      console.log('[WS DISCONNECTED]', this.url)
      if (this.socket !== socket) return
      this.socket = null
      if (this.stopped) return
      this.emitStatus({ phase: 'offline', username: '', roomId: '', detail: 'Bridge disconnected' })
      console.log('[WS RECONNECTING]', this.url)
      this.schedule()
    })
    socket.addEventListener('error', () => {
      console.error('[WS ERROR]', this.url)
      socket.close()
    })
  }

  private async receive(data: unknown): Promise<void> {
    let text = ''
    if (typeof data === 'string') text = data
    else if (data instanceof Blob) text = await data.text()
    else return
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch (error) {
      console.error('[WS ERROR]', error instanceof Error ? error.message : 'invalid JSON')
      return
    }
    console.log('[WS RECEIVE]', value)
    const message = interpretSocketText(text)
    if (!message) {
      console.error('[WS ERROR]', 'unrecognized message')
      return
    }
    if (message.type === 'connection_status') {
      this.emitStatus(statusFrom(message))
      return
    }
    if (message.type === 'chatReceived') {
      for (const listener of this.chatListeners) listener(message.payload)
      const action = chatAction(message.payload.text)
      if (action.type === 'join') {
        console.log('[TEAM COMMAND]', {
          userId: message.payload.userId,
          uniqueId: message.payload.username,
          command: message.payload.text.trim().toLowerCase(),
          team: action.team,
        })
        const join: TikTokLiveEvent = {
          type: 'viewerJoined',
          payload: {
            userId: message.payload.userId,
            username: message.payload.username,
            avatarUrl: message.payload.avatarUrl,
            team: action.team,
            explicit: true,
            ...(message.payload.eventId ? { eventId: message.payload.eventId } : {}),
          },
        }
        for (const listener of this.listeners) listener(join)
        return
      }
      const comment: TikTokLiveEvent = { type: 'commentReceived', payload: message.payload }
      for (const listener of this.listeners) listener(comment)
      return
    }
    for (const listener of this.listeners) listener(message)
  }

  private schedule(): void {
    if (this.stopped || this.timer) return
    const wait = this.retryMs
    this.retryMs = Math.min(10_000, this.retryMs * 2)
    this.timer = window.setTimeout(() => {
      this.timer = 0
      this.open()
    }, wait)
  }

  private emitStatus(status: LiveLinkStatus): void {
    if (status.phase === 'live') this.retryMs = 1_000
    for (const listener of this.statusListeners) listener(status)
  }
}

function statusFrom(message: LiveConnectionStatus): LiveLinkStatus {
  if (message.connected) {
    return { phase: 'live', username: message.username, roomId: message.roomId, detail: message.detail || 'LIVE' }
  }
  const detail = message.detail || 'Offline'
  const phase = detail === 'Connecting' ? 'connecting' : 'offline'
  return { phase, username: message.username, roomId: message.roomId, detail }
}

export function interpretSocketText(raw: string): TikTokLiveEvent | LiveConnectionStatus | { type: 'chatReceived'; payload: LiveChatPayload } | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || typeof value.type !== 'string') return null
  if (value.type === 'connection_status') return parseStatus(value)
  if (value.type === 'chat') {
    const payload = parseChat({
      userId: value.userId,
      username: value.username,
      avatarUrl: value.avatarUrl,
      text: typeof value.comment === 'string' ? value.comment : value.text,
      eventId: value.eventId,
    })
    return payload ? { type: 'chatReceived', payload } : null
  }
  if (value.type === 'like') {
    const payload = parseLike(value)
    return payload ? { type: 'likeReceived', payload } : null
  }
  if (value.type === 'gift') {
    const payload = parseGift({
      ...value,
      giftId: value.giftId == null ? '' : String(value.giftId),
      giftCount: value.repeatCount ?? value.giftCount,
      coinValue: value.diamonds ?? value.coinValue,
    })
    return payload ? { type: 'giftReceived', payload } : null
  }
  if (value.type === 'join') {
    const payload = parseViewer(value)
    if (!payload) return null
    return { type: 'viewerJoined', payload: { ...payload, ...(value.explicit === true ? { explicit: true } : {}) } }
  }
  if (value.type === 'follow' || value.type === 'share') {
    const person = parsePerson(value)
    if (!person) return null
    const team = readTeam(value.team)
    const payload = { ...person, ...(team ? { team } : {}) }
    return { type: value.type === 'follow' ? 'followReceived' : 'shareReceived', payload }
  }
  if (value.type === 'chatReceived') {
    const payload = parseChat(value.payload)
    return payload ? { type: 'chatReceived', payload } : null
  }
  if (value.type === 'viewerJoined' || value.type === 'followReceived' || value.type === 'shareReceived') {
    const payload = parseViewer(value.payload)
    if (!payload) return null
    const explicit = value.type === 'viewerJoined' && isRecord(value.payload) && value.payload.explicit === true
    return { type: value.type, payload: { ...payload, ...(explicit ? { explicit: true } : {}) } }
  }
  if (value.type === 'likeReceived') {
    const payload = parseLike(value.payload)
    return payload ? { type: 'likeReceived', payload } : null
  }
  if (value.type === 'giftReceived') {
    const payload = parseGift(value.payload)
    return payload ? { type: 'giftReceived', payload } : null
  }
  return null
}

function parseStatus(value: Record<string, unknown>): LiveConnectionStatus | null {
  if (typeof value.connected !== 'boolean') return null
  return {
    type: 'connection_status',
    connected: value.connected,
    username: typeof value.username === 'string' ? value.username : '',
    roomId: typeof value.roomId === 'string' ? value.roomId : '',
    detail: typeof value.detail === 'string' ? value.detail : '',
  }
}

function readTeam(value: unknown): 'red' | 'blue' | null {
  if (value === 'red' || value === 'canada') return 'red'
  if (value === 'blue' || value === 'usa') return 'blue'
  return null
}

function parseViewer(value: unknown): LiveViewer | null {
  if (!isRecord(value)) return null
  const team = readTeam(value.team)
  const userId = value.userId == null || String(value.userId).length === 0 ? '' : String(value.userId)
  const username = typeof value.username === 'string' && value.username.trim()
    ? value.username
    : typeof value.uniqueId === 'string' && value.uniqueId.trim()
      ? value.uniqueId
      : userId
  if (!team || !userId || !username) return null
  return {
    userId,
    username,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : '',
    team,
    ...(typeof value.eventId === 'string' && value.eventId ? { eventId: value.eventId } : {}),
  }
}

function parsePerson(value: unknown): { userId: string; username: string; avatarUrl: string; eventId?: string } | null {
  if (!isRecord(value) || typeof value.username !== 'string') return null
  const userId = value.userId == null || String(value.userId).length === 0 ? '' : String(value.userId)
  if (!userId) return null
  return {
    userId,
    username: value.username,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : '',
    ...(typeof value.eventId === 'string' && value.eventId ? { eventId: value.eventId } : {}),
  }
}

function parseLike(value: unknown): (Omit<LiveViewer, 'team'> & { team?: 'red' | 'blue'; count: number }) | null {
  if (!isRecord(value)) return null
  const person = parsePerson(value)
  const viewer = parseViewer(value)
  const base = viewer ?? person
  if (!base) return null
  const team = readTeam(value.team)
  return { ...base, ...(team ? { team } : {}), count: positiveCount(value.count) }
}

function positiveCount(value: unknown): number {
  const count = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 1
  if (!Number.isFinite(count) || count <= 0) return 1
  return Math.min(500, Math.round(count))
}

function parseGift(value: unknown): (Omit<LiveViewer, 'team'> & { team?: 'red' | 'blue'; giftId: string; giftName: string; giftCount: number; visualCount?: number; coinValue?: number; repeatEnd?: boolean; preview?: boolean; image?: string }) | null {
  if (!isRecord(value)) return null
  const person = parsePerson(value)
  const viewer = parseViewer(value)
  const base = viewer ?? person
  const giftId = value.giftId == null ? '' : String(value.giftId)
  if (!base || !giftId || typeof value.giftName !== 'string') return null
  const rawCount = value.giftCount ?? value.repeatCount
  const giftCount = typeof rawCount === 'number' && rawCount > 0 ? rawCount : 1
  const visualCount = typeof value.visualCount === 'number' && value.visualCount >= 0 ? value.visualCount : undefined
  const team = readTeam(value.team)
  return {
    ...base,
    ...(team ? { team } : {}),
    giftId,
    giftName: value.giftName,
    giftCount,
    ...(visualCount != null ? { visualCount } : {}),
    ...(typeof value.coinValue === 'number' ? { coinValue: value.coinValue } : {}),
    ...(typeof value.repeatEnd === 'boolean' ? { repeatEnd: value.repeatEnd } : {}),
    ...(value.preview === true ? { preview: true } : {}),
    ...(typeof value.image === 'string' && value.image ? { image: value.image } : {}),
  }
}

function parseChat(value: unknown): LiveChatPayload | null {
  if (!isRecord(value) || typeof value.username !== 'string' || typeof value.text !== 'string') return null
  const userId = value.userId == null || String(value.userId).length === 0 ? value.username : String(value.userId)
  return {
    userId,
    username: value.username,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : '',
    text: value.text,
    ...(typeof value.eventId === 'string' && value.eventId ? { eventId: value.eventId } : {}),
  }
}

interface LiveViewer {
  userId: string
  username: string
  avatarUrl: string
  team: 'red' | 'blue'
  eventId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
