import { ControlEvent, TikTokLiveConnection, UserOfflineError, WebcastEvent, type WebcastChatMessage, type WebcastGiftMessage, type WebcastLikeMessage, type WebcastMemberMessage, type WebcastSocialMessage } from 'tiktok-live-connector'
import { chatFrom, classifySocial, GiftStreaks, likeFrom, memberJoin, socialFrom, viewerKey } from './eventNormalizer.ts'
import { SessionTeams, teamCommand } from './teams.ts'
import type { AuroraSocket } from './WebSocketServer.ts'
import type { CatalogGift, LikePayload } from './types.ts'

interface BridgeOptions {
  username: string
  debug: boolean
  signApiKey: string
  socket: AuroraSocket
}

export class TikTokLiveBridge {
  private connection: TikTokLiveConnection | null = null
  private readonly teams = new SessionTeams()
  private readonly streaks = new GiftStreaks()
  private readonly catalog = new Map<string, CatalogGift>()
  private readonly present = new Set<string>()
  private readonly likes = new Map<string, { payload: LikePayload; timer: NodeJS.Timeout }>()
  private timer: NodeJS.Timeout | null = null
  private delayMs = 3_000
  private stopped = false
  private connecting = false

  constructor(private readonly options: BridgeOptions) {}

  start(): void {
    this.stopped = false
    if (!this.options.username) {
      console.error('[TIKTOK] Set TIKTOK_USERNAME in .env before starting the bridge.')
      this.options.socket.publishStatus({
        type: 'connection_status',
        connected: false,
        username: '',
        roomId: '',
        detail: 'Username missing',
      })
      return
    }
    void this.connect()
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const pending of this.likes.values()) clearTimeout(pending.timer)
    this.likes.clear()
    const connection = this.connection
    this.connection = null
    if (connection) await connection.disconnect().catch(() => undefined)
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting) return
    this.connecting = true
    const username = this.options.username
    this.options.socket.publishStatus({
      type: 'connection_status',
      connected: false,
      username,
      roomId: '',
      detail: 'Connecting',
    })
    console.log(`[TIKTOK] Connecting to @${username}`)
    const signApiKey = this.options.signApiKey
    const connection = new TikTokLiveConnection(username, {
      processInitialData: false,
      enableExtendedGiftInfo: false,
      fetchRoomInfoOnConnect: true,
      ...(signApiKey ? { signApiKey } : {}),
    })
    this.connection = connection
    this.bind(connection)
    try {
      const state = await connection.connect()
      this.delayMs = 3_000
      console.log(`[TIKTOK] Connected to @${username}`)
      console.log(`[TIKTOK] Room: ${state.roomId}`)
      this.options.socket.publishStatus({
        type: 'connection_status',
        connected: true,
        username,
        roomId: state.roomId,
        detail: 'LIVE',
      })
      console.log('[TIKTOK] Listening for live gifts, likes, and chat')
    } catch (error) {
      this.connecting = false
      const offline = error instanceof UserOfflineError
      const message = error instanceof Error ? error.message : 'Connection failed'
      console.error(offline ? `[TIKTOK] @${username} is not currently LIVE` : `[TIKTOK] Connection failed: ${message}`)
      this.options.socket.publishStatus({
        type: 'connection_status',
        connected: false,
        username,
        roomId: '',
        detail: offline ? 'Not live' : 'Connection failed',
      })
      this.schedule(offline ? 15_000 : this.delayMs)
    } finally {
      this.connecting = false
    }
  }

  private bind(connection: TikTokLiveConnection): void {
    connection.on(ControlEvent.DISCONNECTED, () => {
      if (this.stopped || this.connection !== connection) return
      console.log('[TIKTOK] Disconnected')
      this.options.socket.publishStatus({
        type: 'connection_status',
        connected: false,
        username: this.options.username,
        roomId: '',
        detail: 'Disconnected',
      })
      this.schedule(this.delayMs)
    })
    connection.on(ControlEvent.ERROR, (event: { info?: string; exception?: { message?: string } }) => {
      const message = event.exception?.message || event.info || 'Unknown error'
      console.error(`[TIKTOK] Error: ${message}`)
      if (this.options.debug && event.info) console.log(`[TIKTOK] Detail: ${event.info}`)
    })
    connection.on(WebcastEvent.STREAM_END, () => {
      console.log('[TIKTOK] LIVE ended')
      this.options.socket.publishStatus({
        type: 'connection_status',
        connected: false,
        username: this.options.username,
        roomId: connection.roomId,
        detail: 'LIVE ended',
      })
    })
    connection.on(WebcastEvent.MEMBER, (message: WebcastMemberMessage) => this.safe('member', () => this.onMember(message)))
    connection.on(WebcastEvent.GIFT, (message: WebcastGiftMessage) => this.safe('gift', () => this.onGift(message)))
    connection.on(WebcastEvent.LIKE, (message: WebcastLikeMessage) => this.safe('like', () => this.onLike(message)))
    connection.on(WebcastEvent.CHAT, (message: WebcastChatMessage) => this.safe('chat', () => this.onChat(message)))
    connection.on(WebcastEvent.FOLLOW, (message: WebcastSocialMessage) => this.safe('follow', () => this.onSocial(message, 'follow')))
    connection.on(WebcastEvent.SHARE, (message: WebcastSocialMessage) => this.safe('share', () => this.onSocial(message, 'share')))
    connection.on(WebcastEvent.SOCIAL, (message: WebcastSocialMessage) => this.safe('social', () => this.onSocial(message, classifySocial(message))))
  }

  private onMember(message: WebcastMemberMessage): void {
    const viewer = memberJoin(message, this.teams)
    if (!viewer || this.present.has(viewer.userId)) return
    this.present.add(viewer.userId)
    console.log(`[JOIN] @${viewer.username}`)
    this.options.socket.broadcast({ type: 'viewerJoined', payload: viewer })
  }

  private onGift(message: WebcastGiftMessage): void {
    const decision = this.streaks.decide(message, this.teams, this.catalog)
    if (!decision) return
    if (decision.kind === 'streak') {
      console.log(`[GIFT] streak @${decision.username} ${decision.giftName} x${decision.count}`)
      return
    }
    if (!decision.payload) return
    this.announce(decision.payload)
    this.options.socket.broadcast({ type: 'giftReceived', payload: decision.payload })
    console.log('[GIFT]')
    console.log(`@${decision.username}`)
    console.log(decision.giftName)
    console.log(`x${decision.count}`)
    if (this.options.debug) {
      console.log(`[TIKTOK] giftId=${decision.payload.giftId} coins=${decision.payload.coinValue ?? 'unknown'} repeatEnd=${String(message.repeatEnd)}`)
    }
  }

  private onLike(message: WebcastLikeMessage): void {
    const like = likeFrom(message, this.teams)
    if (!like) return
    const pending = this.likes.get(like.userId)
    if (pending) {
      pending.payload = { ...like, count: pending.payload.count + like.count }
      return
    }
    const timer = setTimeout(() => {
      const item = this.likes.get(like.userId)
      this.likes.delete(like.userId)
      if (!item) return
      this.announce(item.payload)
      this.options.socket.broadcast({ type: 'likeReceived', payload: item.payload })
      console.log(`[LIKE]\n@${item.payload.username} +${item.payload.count}`)
    }, 100)
    this.likes.set(like.userId, { payload: like, timer })
  }

  private onChat(message: WebcastChatMessage): void {
    const requested = teamCommand(message.content ?? '')
    const userId = viewerKey(message.user)
    if (requested && userId) {
      this.teams.assign(userId, requested)
      const pending = this.likes.get(userId)
      if (pending) pending.payload = { ...pending.payload, team: requested }
    }
    const chat = chatFrom(message, this.teams)
    if (!chat) return
    console.log(`[CHAT]\n@${chat.username}: ${chat.text}`)
    this.options.socket.broadcast({ type: 'chatReceived', payload: chat })
    if (!requested) return
    this.present.add(chat.userId)
    console.log(`[TEAM] @${chat.username} chose ${requested}`)
    this.options.socket.broadcast({
      type: 'viewerJoined',
      payload: { userId: chat.userId, username: chat.username, avatarUrl: chat.avatarUrl, team: requested },
    })
  }

  private onSocial(message: WebcastSocialMessage, kind: 'follow' | 'share' | 'other'): void {
    const viewer = socialFrom(message, this.teams, kind)
    if (!viewer) {
      if (this.options.debug) console.log(`[TIKTOK] Social event ignored (${message.action || 'no action'})`)
      return
    }
    this.announce(viewer)
    console.log(`[${kind.toUpperCase()}] @${viewer.username}`)
    this.options.socket.broadcast({ type: kind === 'follow' ? 'followReceived' : 'shareReceived', payload: viewer })
  }

  private announce(viewer: { userId: string; username: string; avatarUrl: string; team: 'red' | 'blue' }): void {
    if (this.present.has(viewer.userId)) return
    this.present.add(viewer.userId)
    console.log(`[JOIN] @${viewer.username}`)
    this.options.socket.broadcast({
      type: 'viewerJoined',
      payload: { userId: viewer.userId, username: viewer.username, avatarUrl: viewer.avatarUrl, team: viewer.team },
    })
  }

  private schedule(delay: number): void {
    if (this.stopped || this.timer) return
    const wait = Math.min(30_000, Math.max(3_000, delay))
    this.delayMs = Math.min(30_000, wait * 2)
    console.log(`[TIKTOK] Reconnecting in ${Math.round(wait / 1000)}s`)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.connect()
    }, wait)
  }

  private safe(label: string, run: () => void): void {
    try {
      run()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.error(`[TIKTOK] Failed to handle ${label}: ${message}`)
    }
  }
}
