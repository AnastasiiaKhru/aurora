import type { TeamId } from '../types/Team.ts'

const PORTRAITS = 60
/** 47.jpg is a byte-for-byte copy of 45.jpg, so it stays out of the pool. */
const SKIP = new Set([47])

const POOL: string[] = []
for (let slot = 1; slot <= PORTRAITS; slot += 1) {
  if (SKIP.has(slot)) continue
  POOL.push(String(slot).padStart(2, '0'))
}

interface PortraitUse {
  red: number
  blue: number
}

const owners = new Map<string, { file: string; team: TeamId }>()
const usage = new Map<string, PortraitUse>()

function emptyUse(): PortraitUse {
  return { red: 0, blue: 0 }
}

function localArt(file: string): { key: string; url: string } {
  return { key: `local:${file}`, url: `/avatars/${file}.jpg` }
}

function fileOf(url: string): string | null {
  const match = /\/avatars\/(\d+)\.(?:jpg|jpeg|png|webp)$/i.exec(url.trim())
  if (!match) return null
  const slot = Number(match[1])
  if (!Number.isFinite(slot) || slot < 1 || slot > PORTRAITS || SKIP.has(slot)) return null
  return String(slot).padStart(2, '0')
}

function useOf(file: string): PortraitUse {
  let row = usage.get(file)
  if (!row) {
    row = emptyUse()
    usage.set(file, row)
  }
  return row
}

function assign(id: string, team: TeamId, file: string): void {
  const previous = owners.get(id)
  if (previous?.file === file && previous.team === team) return
  if (previous) releaseDummyAvatar(id)
  owners.set(id, { file, team })
  useOf(file)[team] += 1
}

export function resetDummyAvatars(): void {
  owners.clear()
  usage.clear()
}

export function releaseDummyAvatar(id: string): void {
  const owned = owners.get(id)
  if (!owned) return
  owners.delete(id)
  const row = usage.get(owned.file)
  if (!row) return
  row[owned.team] = Math.max(0, row[owned.team] - 1)
  if (row.red <= 0 && row.blue <= 0) usage.delete(owned.file)
}

export function claimDummyAvatar(id: string, team: TeamId, preferredUrl = ''): { key: string; url: string } {
  const owned = owners.get(id)
  if (owned) return localArt(owned.file)

  const preferred = fileOf(preferredUrl)
  if (preferred && !usage.has(preferred)) {
    assign(id, team, preferred)
    return localArt(preferred)
  }

  for (const file of POOL) {
    if (usage.has(file)) continue
    assign(id, team, file)
    return localArt(file)
  }

  let best = POOL[0] ?? '01'
  let bestOpposite = Number.POSITIVE_INFINITY
  let bestOwn = Number.POSITIVE_INFINITY
  for (const file of POOL) {
    const row = usage.get(file) ?? emptyUse()
    const other = team === 'red' ? row.blue : row.red
    const own = row[team]
    if (other < bestOpposite || (other === bestOpposite && own < bestOwn)) {
      best = file
      bestOpposite = other
      bestOwn = own
    }
  }
  assign(id, team, best)
  return localArt(best)
}

export function safeAvatarUrl(url: string, initials: string, hue: number, seed: number): { key: string; url: string } {
  const trimmed = url.trim()
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return { key: `remote:${trimmed}`, url: trimmed }
  }
  const local = fileOf(trimmed)
  if (local) return localArt(local)
  if (trimmed.startsWith('/')) return { key: `local:${trimmed}`, url: trimmed }
  return makeAvatar(initials, hue, seed)
}

export function makeAvatar(initials: string, hue: number, seed: number): { key: string; url: string } {
  const start = Math.abs(seed + initials.length * 13 + hue) % POOL.length
  for (let step = 0; step < POOL.length; step += 1) {
    const file = POOL[(start + step) % POOL.length] ?? '01'
    if (!usage.has(file)) return localArt(file)
  }
  return localArt(POOL[start] ?? '01')
}

export function isRemoteAvatar(url: string): boolean {
  const trimmed = url.trim()
  return trimmed.startsWith('https://') || trimmed.startsWith('http://')
}
