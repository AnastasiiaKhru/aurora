const STORAGE_KEY = 'aurora.round.v1'
const CHANNEL_NAME = 'aurora-round'

export interface RoundStamp {
  id: string
  startedAt: number
  owner: string
}

type RoundListener = (stamp: RoundStamp) => void

export function readRound(): RoundStamp | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RoundStamp
    if (!parsed || typeof parsed.startedAt !== 'number' || typeof parsed.id !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function writeRound(stamp: RoundStamp): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stamp))
  } catch {
    // Private mode can reject storage. This window still runs the countdown it just armed.
  }
  postRound(stamp)
}

export function subscribeRound(listener: RoundListener): () => void {
  if (typeof window === 'undefined') return () => undefined
  let channel: BroadcastChannel | null = null
  const onMessage = (event: MessageEvent<RoundStamp>) => {
    const stamp = event.data
    if (!stamp || typeof stamp.startedAt !== 'number' || typeof stamp.id !== 'string') return
    listener(stamp)
  }
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener('message', onMessage)
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      listener(JSON.parse(event.newValue) as RoundStamp)
    } catch {
      // Ignore malformed stamps from another tab.
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    channel?.removeEventListener('message', onMessage)
    channel?.close()
    window.removeEventListener('storage', onStorage)
  }
}

function postRound(stamp: RoundStamp): void {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(CHANNEL_NAME)
  channel.postMessage(stamp)
  channel.close()
}
