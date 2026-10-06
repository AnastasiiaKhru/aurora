/**
 * One Web Audio graph for the page.
 * Music and attack sounds meet only at the master bus, then a compressor and limiter.
 */

export interface AudioGraph {
  context: AudioContext
  master: GainNode
  music: GainNode
  effects: GainNode
  duck: GainNode
  bedTrim: GainNode
  warmth: BiquadFilterNode
  intensity: BiquadFilterNode
  compressor: DynamicsCompressorNode
  limiter: DynamicsCompressorNode
}

export type AudioRoute = 'battle' | 'admin'

interface StreamStamp {
  id: string
  at: number
  route: AudioRoute
}

export const LIMITER_THRESHOLD_DB = -1.2

const OWNER_KEY = 'aurora-audio-owner'
const PRODUCERS_KEY = 'aurora-audio-live'
const STALE_MS = 2500

const tabId = Math.random().toString(36).slice(2)
let graph: AudioGraph | null = null
let ownerCache: { at: number; stamp: StreamStamp | null } = { at: 0, stamp: null }
let producerCache: { at: number; items: StreamStamp[] } = { at: 0, items: [] }
let lastOwnerWrite = 0
let lastProducerWrite = 0
let producerMarked = false

export function audioTabId(): string {
  return tabId
}

export function getAudioGraph(): AudioGraph | null {
  return graph
}

export function createAudioGraph(ctx: AudioContext): AudioGraph {
  if (graph && graph.context === ctx) return graph
  const master = ctx.createGain()
  const music = ctx.createGain()
  const effects = ctx.createGain()
  const duck = ctx.createGain()
  const bedTrim = ctx.createGain()
  const warmth = ctx.createBiquadFilter()
  const intensity = ctx.createBiquadFilter()
  const compressor = ctx.createDynamicsCompressor()
  const limiter = ctx.createDynamicsCompressor()

  warmth.type = 'lowpass'
  warmth.frequency.value = 1200
  warmth.Q.value = 0.5
  intensity.type = 'lowpass'
  intensity.frequency.value = 18000
  intensity.Q.value = 0.7

  compressor.threshold.value = -14
  compressor.knee.value = 12
  compressor.ratio.value = 6
  compressor.attack.value = 0.008
  compressor.release.value = 0.2

  limiter.threshold.value = LIMITER_THRESHOLD_DB
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.06

  music.gain.value = 0.0001
  effects.gain.value = 0.55
  duck.gain.value = 1
  bedTrim.gain.value = 0.09
  master.gain.value = 1

  music.connect(intensity)
  intensity.connect(master)
  duck.connect(bedTrim)
  bedTrim.connect(warmth)
  warmth.connect(master)
  effects.connect(master)
  master.connect(compressor)
  compressor.connect(limiter)
  limiter.connect(ctx.destination)

  graph = { context: ctx, master, music, effects, duck, bedTrim, warmth, intensity, compressor, limiter }
  return graph
}

export function claimStream(route: AudioRoute): boolean {
  const now = Date.now()
  const current = readOwner(now)
  const fresh = !!current && now - current.at < STALE_MS
  if (fresh && current && current.id !== tabId) {
    if (!(route === 'battle' && current.route === 'admin')) return false
  }
  if (fresh && current && current.id === tabId && current.route === route && now - lastOwnerWrite < 800) return true
  const stamp = { id: tabId, at: now, route }
  writeOwner(stamp)
  lastOwnerWrite = now
  return true
}

export function releaseStream(): void {
  const current = readOwner(Date.now())
  if (!current || current.id !== tabId) return
  try {
    localStorage.removeItem(OWNER_KEY)
  } catch {
    // Private mode can reject storage. Audio still stops in this tab.
  }
  ownerCache = { at: Date.now(), stamp: null }
  lastOwnerWrite = 0
}

export function streamOwner(): StreamStamp | null {
  const stamp = readOwner(Date.now())
  if (!stamp || Date.now() - stamp.at >= STALE_MS) return null
  return stamp
}

export function noteProducer(route: AudioRoute): void {
  const now = Date.now()
  if (producerMarked && now - lastProducerWrite < 800) return
  const items = readProducers(now).filter((item) => item.id !== tabId && now - item.at < STALE_MS)
  items.push({ id: tabId, at: now, route })
  writeProducers(items)
  producerMarked = true
  lastProducerWrite = now
}

export function clearProducer(): void {
  if (!producerMarked) return
  const now = Date.now()
  const items = readProducers(now).filter((item) => item.id !== tabId && now - item.at < STALE_MS)
  writeProducers(items)
  producerMarked = false
}

export function streamProducers(): StreamStamp[] {
  const now = Date.now()
  return readProducers(now).filter((item) => now - item.at < STALE_MS)
}

function readOwner(now: number): StreamStamp | null {
  if (now - ownerCache.at < 300) return ownerCache.stamp
  ownerCache = { at: now, stamp: readStamp(OWNER_KEY) }
  return ownerCache.stamp
}

function writeOwner(stamp: StreamStamp): void {
  try {
    localStorage.setItem(OWNER_KEY, JSON.stringify(stamp))
  } catch {
    // Ignore storage failures. This tab still plays locally.
  }
  ownerCache = { at: Date.now(), stamp }
}

function readProducers(now: number): StreamStamp[] {
  if (now - producerCache.at < 300) return producerCache.items
  let items: StreamStamp[] = []
  try {
    const raw = localStorage.getItem(PRODUCERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) items = parsed.filter(isStamp)
    }
  } catch {
    items = []
  }
  producerCache = { at: now, items }
  return items
}

function writeProducers(items: StreamStamp[]): void {
  try {
    localStorage.setItem(PRODUCERS_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage failures.
  }
  producerCache = { at: Date.now(), items }
}

function readStamp(key: string): StreamStamp | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return isStamp(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isStamp(value: unknown): value is StreamStamp {
  if (!value || typeof value !== 'object') return false
  const stamp = value as StreamStamp
  return (stamp.route === 'battle' || stamp.route === 'admin') && typeof stamp.id === 'string' && typeof stamp.at === 'number'
}
