export type BroadcastMode = 'simulator' | 'private' | 'live'

export type CheckId =
  | 'build'
  | 'tiktok'
  | 'websocket'
  | 'join'
  | 'interactions'
  | 'gifts'
  | 'reset'
  | 'zones'
  | 'audio'
  | 'performance'
  | 'console'
  | 'capture'
  | 'preview'

export type CheckState = 'pass' | 'fail' | 'untested'

export interface PreflightCheck {
  id: CheckId
  label: string
}

export const REQUIRED_CHECKS: PreflightCheck[] = [
  { id: 'build', label: 'Build passes' },
  { id: 'tiktok', label: 'TikTok connection passes' },
  { id: 'websocket', label: 'WebSocket passes' },
  { id: 'join', label: 'Join commands pass' },
  { id: 'interactions', label: 'Interaction events pass' },
  { id: 'gifts', label: 'Gift mappings pass' },
  { id: 'reset', label: 'Battle reset passes' },
  { id: 'zones', label: 'Safe zones pass' },
  { id: 'audio', label: 'Audio passes' },
  { id: 'performance', label: 'Performance passes' },
  { id: 'console', label: 'No console errors' },
  { id: 'capture', label: 'Capture window detected' },
  { id: 'preview', label: 'User manually confirms preview' },
]

/** A downloaded report must not flip checks that only a live session can prove. */
const REPORT_BLOCKED: ReadonlySet<CheckId> = new Set([
  'tiktok',
  'websocket',
  'audio',
  'performance',
  'console',
  'capture',
  'preview',
])

export interface LiveLogEntry {
  at: number
  summary: string
}

interface PreflightStore {
  mode: BroadcastMode
  checks: Record<CheckId, CheckState>
  details: Record<CheckId, string>
  boxChecked: boolean
  errors: number
  log: LiveLogEntry[]
}

function blankChecks(): Record<CheckId, CheckState> {
  return {
    build: 'untested',
    tiktok: 'untested',
    websocket: 'untested',
    join: 'untested',
    interactions: 'untested',
    gifts: 'untested',
    reset: 'untested',
    zones: 'untested',
    audio: 'untested',
    performance: 'untested',
    console: 'untested',
    capture: 'untested',
    preview: 'untested',
  }
}

function blankDetails(): Record<CheckId, string> {
  return {
    build: 'Run the production build',
    tiktok: 'Connect a real TikTok LIVE from Private test',
    websocket: 'Waiting for the bridge socket',
    join: 'Not run',
    interactions: 'Not run',
    gifts: 'Not run',
    reset: 'Not run',
    zones: 'Not run',
    audio: 'Play, mute, and a LIVE Studio capture are still required',
    performance: 'Run the stress test in this browser',
    console: 'Watching this page',
    capture: 'Open the TikTok capture window',
    preview: 'Check the box, then confirm the preview',
  }
}

const store: PreflightStore = {
  mode: 'simulator',
  checks: blankChecks(),
  details: blankDetails(),
  boxChecked: false,
  errors: 0,
  log: [],
}

const listeners = new Set<() => void>()
let version = 0

export function preflightVersion(): number {
  return version
}

function emit(): void {
  version += 1
  for (const listener of listeners) listener()
}

export function subscribePreflight(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function preflightSnapshot(): PreflightStore {
  return store
}

export function setBroadcastMode(mode: BroadcastMode): void {
  store.mode = mode
  emit()
}

export function setCheck(id: CheckId, state: CheckState, detail: string): void {
  store.checks[id] = state
  store.details[id] = detail
  emit()
}

export function applyAutomatedReport(checks: Partial<Record<CheckId, CheckState>>, details: Partial<Record<CheckId, string>>): void {
  for (const check of REQUIRED_CHECKS) {
    if (REPORT_BLOCKED.has(check.id)) continue
    const state = checks[check.id]
    if (state !== 'pass' && state !== 'fail') continue
    store.checks[check.id] = state
    const detail = details[check.id]
    if (detail) store.details[check.id] = detail
  }
  emit()
}

export function setPreviewBox(checked: boolean): void {
  store.boxChecked = checked
  emit()
}

export function confirmPreview(): boolean {
  if (!store.boxChecked) return false
  setCheck('preview', 'pass', 'Operator confirmed the LIVE Studio preview')
  return true
}

export function canEnableLive(): boolean {
  return REQUIRED_CHECKS.every((check) => store.checks[check.id] === 'pass')
}

export function noteConsoleError(): void {
  store.errors += 1
  store.checks.console = 'fail'
  store.details.console = `${store.errors} unhandled error${store.errors === 1 ? '' : 's'} on this page`
  emit()
}

export function consoleErrorCount(): number {
  return store.errors
}

export function recordLiveEvent(summary: string): void {
  store.log = [{ at: Date.now(), summary }, ...store.log].slice(0, 40)
  emit()
}
