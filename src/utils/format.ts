export function formatScore(value: number): string {
  const rounded = Math.round(value)
  if (Math.abs(rounded) >= 1_000_000) {
    return `${(rounded / 1_000_000).toFixed(2)}M`
  }
  return rounded.toLocaleString('en-US')
}

export function formatDamage(value: number): string {
  return `-${Math.round(Math.abs(value)).toLocaleString('en-US')}`
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return formatMinutes(total)
}

export function formatElapsed(ms: number): string {
  return formatMinutes(Math.floor(Math.max(0, ms) / 1000))
}

function formatMinutes(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function initialsOf(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, '')
  const source = clean.length > 0 ? clean : 'AA'
  return source.slice(0, 2).toUpperCase()
}
