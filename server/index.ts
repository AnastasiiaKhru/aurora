import 'dotenv/config'
import { TikTokLiveBridge } from './TikTokLiveBridge.ts'
import { AuroraSocket } from './WebSocketServer.ts'

const port = readPort(process.env.WS_PORT)
const username = (process.env.TIKTOK_USERNAME ?? '').trim().replace(/^@/, '')
const socket = new AuroraSocket(port)
const signApiKey = (process.env.EULER_API_KEY ?? '').trim()
if (!signApiKey) {
  console.error('[TIKTOK] EULER_API_KEY is missing. The webcast connection needs that key in .env.')
}
const bridge = new TikTokLiveBridge({
  username,
  debug: process.env.DEBUG_TIKTOK === 'true',
  signApiKey,
  socket,
})

socket.listen()
bridge.start()

let closing = false
const shutdown = (): void => {
  if (closing) return
  closing = true
  void bridge.stop().then(() => socket.close()).then(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function readPort(value: string | undefined): number {
  const port = Number(value ?? 8080)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 8080
  return port
}
