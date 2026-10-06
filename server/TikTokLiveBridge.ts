import { ControlEvent, TikTokLiveConnection, UserOfflineError, WebcastEvent, type WebcastChatMessage, type WebcastGiftMessage, type WebcastLikeMessage, type WebcastMemberMessage, type WebcastSocialMessage } from 'tiktok-live-connector'
import { chatFrom, classifySocial, commentOf, GiftStreaks, likeFrom, memberJoin, socialFrom, uniqueIdOf, usernameOf, viewerKey, wireChat, wireGift, wireLike, wireSocial } from './eventNormalizer.ts'
import { SessionTeams, teamCommand } from './teams.ts'
import type { AuroraSocket } from './WebSocketServer.ts'
import type { CatalogGift, TeamId } from './types.ts'

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
  private timer: NodeJS.Timeout | null = null
  private delayMs = 3_000
  private stopped = false
  private connecting = false
  private sampled = false

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
    this.options.socket.broadcast(wireSocial('join', viewer))
  }

  private onGift(message: WebcastGiftMessage): void {
    const userId = viewerKey(message.user)
    const username = usernameOf(message.user)
    console.log('[TIKTOK GIFT]', {
      user: username,
      userId,
      giftName: message.gift?.name || '',
      giftId: message.giftId,
      diamondCount: message.gift?.diamondCount,
      repeatCount: message.repeatCount,
      repeatEnd: message.repeatEnd,
    })
    if (!userId) {
      console.log(`[EVENT IGNORED - USER NOT ON TEAM] ${username || 'unknown'}`)
      return
    }
    const decision = this.streaks.decide(message, this.teams, this.catalog)
    if (!decision) return
    if (decision.kind === 'streak' || !decision.payload) {
      console.log(`[GIFT] streak @${decision.username} ${decision.giftName} x${decision.count}`)
      return
    }
    this.announce(decision.payload)
    this.options.socket.broadcast(wireGift(decision.payload))
    console.log('[GIFT]')
    console.log(`@${decision.username}`)
    console.log(decision.giftName)
    console.log(`x${decision.count}`)
    if (this.options.debug) {
      console.log(`[TIKTOK] giftId=${decision.payload.giftId} coins=${decision.payload.coinValue ?? 'unknown'} repeatEnd=${String(message.repeatEnd)}`)
    }
  }

  private onLike(message: WebcastLikeMessage): void {
    const userId = viewerKey(message.user)
    const username = usernameOf(message.user)
    console.log('[TIKTOK LIKE]', {
      user: username,
      userId,
      likeCount: message.count,
      totalLikeCount: message.total,
    })
    const like = likeFrom(message, this.teams)
    if (!like) {
      console.log(`[EVENT IGNORED - USER NOT ON TEAM] ${username || 'unknown'}`)
      return
    }
    this.announce(like)
    this.options.socket.broadcast(wireLike(like))
    console.log(`[LIKE]\n@${like.username} +${like.count}`)
  }

  private onChat(message: WebcastChatMessage): void {
    const comment = commentOf(message)
    const uniqueId = uniqueIdOf(message.user)
    const nickname = message.user?.nickname?.trim() || ''
    const userId = viewerKey(message.user) || uniqueId || nickname
    console.log('[TIKTOK CHAT]', { userId, uniqueId, nickname, comment })
    if (!this.sampled) {
      this.sampled = true
      console.log('[CHAT SAMPLE]', sampleChat(message))
    }
    const chat = chatFrom(message, this.teams)
    const resolvedId = chat?.userId || userId
    const username = chat?.username || uniqueId || nickname || resolvedId
    const avatarUrl = chat?.avatarUrl ?? ''
    if (!resolvedId || !comment) {
      if (!resolvedId) console.log(`[EVENT IGNORED - NO USER ID] ${nickname || uniqueId || 'unknown'}`)
      return
    }
    if (this.routeChat(resolvedId, username, avatarUrl, comment)) return
    if (!chat) return
    console.log(`[CHAT]\n@${chat.username}: ${chat.text}`)
    this.options.socket.broadcast(wireChat({ ...chat, text: comment }))
  }

  /** Real chat and /admin test chat both pass through here, so a C/U always becomes the same team update. */
  routeChat(userId: string, username: string, avatarUrl: string, comment: string): boolean {
    const team = teamCommand(comment)
    if (!team || !userId) return false
    const command = String(comment ?? '').trim().toLowerCase()
    console.log('[TEAM COMMAND]', { userId, uniqueId: username, command, team })
    this.handleTeamCommand({ userId, username, avatarUrl, team })
    return true
  }

  handleTeamCommand(viewer: { userId: string; username: string; avatarUrl: string; team: TeamId }): void {
    console.log(`TEAM COMMAND DETECTED: ${viewer.team === 'red' ? 'CANADA' : 'USA'} @${viewer.username}`)
    this.teams.assign(viewer.userId, viewer.team)
    this.present.add(viewer.userId)
    const payload = wireSocial('join', viewer, true)
    console.log('[WS SEND TEAM]', payload)
    this.options.socket.broadcast(payload)
    console.log(`WS TEAM UPDATE SENT @${viewer.username} -> ${viewer.team === 'red' ? 'CANADA' : 'USA'}`)
  }

  private onSocial(message: WebcastSocialMessage, kind: 'follow' | 'share' | 'other'): void {
    const userId = viewerKey(message.user)
    const username = usernameOf(message.user)
    if (kind === 'follow') console.log('[TIKTOK FOLLOW]', { user: username, userId })
    if (kind === 'share') console.log('[TIKTOK SHARE]', { user: username, userId })
    const viewer = socialFrom(message, this.teams, kind)
    if (!viewer) {
      if (!userId && kind !== 'other') console.log(`[EVENT IGNORED - USER NOT ON TEAM] ${username || 'unknown'}`)
      if (this.options.debug) console.log(`[TIKTOK] Social event ignored (${message.action || 'no action'})`)
      return
    }
    this.announce(viewer)
    console.log(`[${kind.toUpperCase()}] @${viewer.username}`)
    if (kind === 'other') return
    this.options.socket.broadcast(wireSocial(kind, viewer))
  }

  private announce(viewer: { userId: string; username: string; avatarUrl: string; team: 'red' | 'blue' }): void {
    if (this.present.has(viewer.userId)) return
    this.present.add(viewer.userId)
    console.log(`[JOIN] @${viewer.username}`)
    this.options.socket.broadcast(wireSocial('join', viewer))
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

function sampleChat(message: WebcastChatMessage): Record<string, unknown> {
  const user = message.user as (WebcastChatMessage['user'] & { userId?: unknown; uniqueId?: unknown }) | undefined
  const shorten = (url: string | undefined) => (url ? `${url.split('?')[0]}…` : '')
  return {
    messageKeys: Object.keys(message),
    content: message.content,
    comment: commentOf(message),
    userKeys: user ? Object.keys(user).slice(0, 60) : [],
    'user.id': user?.id,
    'user.userId': user?.userId,
    'user.uniqueId': user?.uniqueId,
    'user.displayId': user?.displayId,
    'user.nickname': user?.nickname,
    'user.avatarThumb': shorten(user?.avatarThumb?.urlList?.[0]),
    'user.avatarMedium': shorten(user?.avatarMedium?.urlList?.[0]),
  }
}
