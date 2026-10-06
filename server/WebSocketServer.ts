import { WebSocket, WebSocketServer } from 'ws'
import { injectWire } from './eventNormalizer.ts'
import type { BridgeMessage, ConnectionStatusMessage } from './types.ts'

const HELD_TEAM_MS = 120_000

export class AuroraSocket {
  private readonly clients = new Set<WebSocket>()
  private readonly heldTeams = new Map<string, { message: BridgeMessage; at: number }>()
  private server: WebSocketServer | null = null
  private status: ConnectionStatusMessage = {
    type: 'connection_status',
    connected: false,
    username: '',
    roomId: '',
    detail: 'Offline',
  }

  /** Lets the bridge take over an injected test chat; returns true when it was handled. */
  routeChat: ((userId: string, username: string, avatarUrl: string, comment: string) => boolean) | null = null

  constructor(private readonly port: number) {}

  listen(): void {
    this.server = new WebSocketServer({ port: this.port, host: '127.0.0.1' })
    this.server.on('connection', (socket) => {
      this.clients.add(socket)
      console.log(`[WS] browser connected (${this.clients.size})`)
      this.send(socket, this.status)
      this.flushTeamUpdates(socket)
      socket.on('message', (data) => this.onClientMessage(data))
      socket.on('close', () => {
        this.clients.delete(socket)
        console.log(`[WS] browser disconnected (${this.clients.size})`)
      })
      socket.on('error', (error) => {
        console.error('[WS ERROR]', error.message)
        this.clients.delete(socket)
      })
    })
    this.server.on('error', (error) => {
      console.error(`[WS] ${error.message}`)
    })
    console.log(`[WS] Listening on ws://localhost:${this.port}`)
  }

  publishStatus(status: ConnectionStatusMessage): void {
    this.status = status
    this.broadcast(status)
  }

  broadcast(message: BridgeMessage): void {
    if (message.type !== 'connection_status') {
      console.log('[WS SEND]', message)
      if (this.clients.size === 0) {
        console.error('[WS ERROR]', 'no browser connected')
        this.holdTeamUpdate(message)
      }
    }
    const body = JSON.stringify(message)
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(body)
    }
  }

  private onClientMessage(data: WebSocket.RawData): void {
    const text = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString() : Array.isArray(data) ? Buffer.concat(data).toString() : Buffer.from(data).toString()
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch (error) {
      console.error('[WS ERROR]', error instanceof Error ? error.message : 'invalid JSON')
      return
    }
    if (!value || typeof value !== 'object' || (value as { type?: unknown }).type !== 'debug_inject') return
    const event = injectWire((value as { event?: unknown }).event)
    if (!event) {
      console.error('[WS ERROR]', 'rejected test event')
      return
    }
    if (event.type === 'chat') {
      console.log(`CHAT RECEIVED @${event.username} (test): ${event.comment}`)
      if (this.routeChat?.(event.userId, event.username, event.avatarUrl, event.comment)) return
    }
    this.broadcast(event)
  }

  async close(): Promise<void> {
    for (const client of this.clients) client.close()
    this.clients.clear()
    const server = this.server
    this.server = null
    if (!server) return
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private send(socket: WebSocket, message: BridgeMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }

  /** A C/U typed while /battle is reloading must still land, so the latest choice per viewer waits for the next browser. */
  private holdTeamUpdate(message: BridgeMessage): void {
    if (message.type !== 'join' || !('explicit' in message) || message.explicit !== true) return
    this.heldTeams.set(message.userId, { message, at: Date.now() })
  }

  private flushTeamUpdates(socket: WebSocket): void {
    const now = Date.now()
    for (const { message, at } of this.heldTeams.values()) {
      if (now - at > HELD_TEAM_MS) continue
      this.send(socket, message)
      console.log(`WS TEAM UPDATE SENT (after reconnect) @${'username' in message ? message.username : ''}`)
    }
    this.heldTeams.clear()
  }
}
