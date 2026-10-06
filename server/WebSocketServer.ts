import { WebSocket, WebSocketServer } from 'ws'
import type { BridgeMessage, ConnectionStatusMessage } from './types.ts'

export class AuroraSocket {
  private readonly clients = new Set<WebSocket>()
  private server: WebSocketServer | null = null
  private status: ConnectionStatusMessage = {
    type: 'connection_status',
    connected: false,
    username: '',
    roomId: '',
    detail: 'Offline',
  }

  constructor(private readonly port: number) {}

  listen(): void {
    this.server = new WebSocketServer({ port: this.port, host: '127.0.0.1' })
    this.server.on('connection', (socket) => {
      this.clients.add(socket)
      this.send(socket, this.status)
      socket.on('close', () => this.clients.delete(socket))
      socket.on('error', () => this.clients.delete(socket))
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
    const body = JSON.stringify(message)
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(body)
    }
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
}
