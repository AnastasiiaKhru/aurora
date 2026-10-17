import type { TeamId } from '../types/Team.ts'

/** Illustrated stand-ins. Real viewers keep their own photos. */
const CUTE: Record<TeamId, readonly string[]> = {
  red: ['ca-anime', 'ca-fox'],
  blue: ['us-anime', 'us-husky'],
}
const POOL = [...CUTE.red, ...CUTE.blue]

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
  return { key: `cute:${file}`, url: `/avatars/cute/${file}.jpg` }
}

function fileOf(url: string): string | null {
  const match = /\/avatars\/cute\/(ca-anime|ca-fox|us-anime|us-husky)\.(?:jpg|jpeg|png|webp)$/i.exec(url.trim())
  if (!match) return null
  return match[1].toLowerCase()
}

function teamFiles(team: TeamId): readonly string[] {
  return CUTE[team]
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
  const choices = teamFiles(team)
  if (preferred && choices.includes(preferred) && !usage.has(preferred)) {
    assign(id, team, preferred)
    return localArt(preferred)
  }

  for (const file of choices) {
    if (usage.has(file)) continue
    assign(id, team, file)
    return localArt(file)
  }

  let best = choices[0] ?? 'ca-anime'
  let bestOpposite = Number.POSITIVE_INFINITY
  let bestOwn = Number.POSITIVE_INFINITY
  for (const file of choices) {
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
    const file = POOL[(start + step) % POOL.length] ?? 'ca-anime'
    if (!usage.has(file)) return localArt(file)
  }
  return localArt(POOL[start] ?? 'ca-anime')
}

export function isRemoteAvatar(url: string): boolean {
  const trimmed = url.trim()
  return trimmed.startsWith('https://') || trimmed.startsWith('http://')
}
