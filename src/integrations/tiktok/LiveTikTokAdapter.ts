import { shouldOpenSocket } from '../../preflight/rules.ts'
import { chatAction } from '../../utils/team.ts'
import type { TikTokAdapter } from './TikTokAdapter.ts'
import type { TikTokLiveEvent } from './TikTokEventTypes.ts'
import type { LiveChatPayload, LiveConnectionStatus, LiveLinkStatus } from './liveMessages.ts'

const DEFAULT_URL = 'ws://localhost:8080'

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
    this.socket = null
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
    } catch {
      this.schedule()
      return
    }
    this.socket = socket
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      const message = interpretSocketText(event.data)
      if (!message) return
      if (message.type === 'connection_status') {
        this.emitStatus(statusFrom(message))
        return
      }
      if (message.type === 'chatReceived') {
        for (const listener of this.chatListeners) listener(message.payload)
        const action = chatAction(message.payload.text)
        if (action.type === 'join') {
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
    })
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      if (this.stopped) return
      this.emitStatus({ phase: 'offline', username: '', roomId: '', detail: 'Bridge disconnected' })
      this.schedule()
    })
    socket.addEventListener('error', () => {
      socket.close()
    })
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
  if (value.type === 'chatReceived') {
    const payload = parseChat(value.payload)
    return payload ? { type: 'chatReceived', payload } : null
  }
  if (value.type === 'viewerJoined' || value.type === 'followReceived' || value.type === 'shareReceived') {
    const payload = parseViewer(value.payload)
    return payload ? { type: value.type, payload } : null
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

function parseViewer(value: unknown): LiveViewer | null {
  if (!isRecord(value)) return null
  const team = value.team === 'red' || value.team === 'blue' ? value.team : null
  const userId = value.userId == null ? '' : String(value.userId)
  if (!team || !userId || typeof value.username !== 'string') return null
  return {
    userId,
    username: value.username,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : '',
    team,
    ...(typeof value.eventId === 'string' && value.eventId ? { eventId: value.eventId } : {}),
  }
}

function parseLike(value: unknown): (LiveViewer & { count: number }) | null {
  const viewer = parseViewer(value)
  if (!viewer || !isRecord(value)) return null
  return { ...viewer, count: positiveCount(value.count) }
}

function positiveCount(value: unknown): number {
  const count = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 1
  if (!Number.isFinite(count) || count <= 0) return 1
  return Math.min(500, Math.round(count))
}

function parseGift(value: unknown): (LiveViewer & { giftId: string; giftName: string; giftCount: number; visualCount?: number; coinValue?: number; repeatEnd?: boolean; preview?: boolean; image?: string }) | null {
  const viewer = parseViewer(value)
  if (!viewer || !isRecord(value) || typeof value.giftId !== 'string' || typeof value.giftName !== 'string') return null
  const giftCount = typeof value.giftCount === 'number' && value.giftCount > 0 ? value.giftCount : 1
  const visualCount = typeof value.visualCount === 'number' && value.visualCount >= 0 ? value.visualCount : undefined
  return {
    ...viewer,
    giftId: value.giftId,
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
