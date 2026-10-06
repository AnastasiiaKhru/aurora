import { useEffect, useRef, useSyncExternalStore } from 'react'
import { captureWindowOpen } from '../broadcast/stage.ts'
import { attackStyles, styles, type AttackStyle } from '../game/attacks/style.ts'
import { LIVE_CONFIRMATION } from '../preflight/rules.ts'
import {
  REQUIRED_CHECKS,
  applyAutomatedReport,
  canEnableLive,
  confirmPreview,
  consoleErrorCount,
  preflightSnapshot,
  preflightVersion,
  setCheck,
  setPreviewBox,
  subscribePreflight,
  type CheckId,
  type CheckState,
} from '../preflight/session.ts'
import { runLogicChecks } from '../preflight/suite.ts'
import { director } from '../systems/GameDirector.ts'

function usePreflightVersion(): number {
  return useSyncExternalStore(subscribePreflight, preflightVersion, preflightVersion)
}

function heapBytes(): number | null {
  const candidate = performance as Performance & { memory?: { usedJSHeapSize: number } }
  return candidate.memory?.usedJSHeapSize ?? null
}

async function loadReport(): Promise<void> {
  try {
    const response = await fetch('/preflight-report.json', { cache: 'no-store' })
    if (!response.ok) return
    const body = (await response.json()) as { checks?: Partial<Record<CheckId, CheckState>>; details?: Partial<Record<CheckId, string>> }
    applyAutomatedReport(body.checks ?? {}, body.details ?? {})
  } catch {
    setCheck('build', 'untested', 'No preflight report was found. Run the production build.')
  }
}

function runLocal(): void {
  const results = runLogicChecks()
  for (const result of results) setCheck(result.id, result.status, result.detail)
  const errors = consoleErrorCount()
  if (errors === 0) setCheck('console', 'pass', 'No unhandled errors on this page')
  else setCheck('console', 'fail', `${errors} unhandled errors on this page`)
}

async function probeAudio(): Promise<void> {
  try {
    const missing = await fetch('/audio/background-track.mp3', { cache: 'no-store' })
    const bed = await fetch('/audio/music/battle-main.wav', { cache: 'no-store' })
    if (!bed.ok) {
      setCheck('audio', 'fail', 'The fallback bed did not load')
      return
    }
    const detail = missing.ok
      ? 'Tracks load. Play, mute, mix level, and LIVE Studio capture still need a manual listen.'
      : 'The optional track is missing and the fallback bed loaded. LIVE Studio capture is still unproven.'
    setCheck('audio', 'untested', detail)
  } catch (error) {
    setCheck('audio', 'fail', error instanceof Error ? error.message : 'Audio request failed')
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function runPerformance(): Promise<void> {
  const before = heapBytes()
  director.battle.status = 'running'
  director.addRandom(50)
  for (let i = 0; i < 100; i += 1) director.handleLike('red', 1, 'stress-like', 'Stress', '')
  for (const style of attackStyles) director.previewAttack(style, 'red', 12)
  director.previewAttack('eclipse', 'blue', 40)
  director.meters.lowestFps = 0
  director.meters.frames = 0
  await wait(2500)
  const after = heapBytes()
  const fps = Math.round(director.meters.fps)
  const lowest = Math.round(director.meters.lowestFps || director.meters.fps)
  const growth = before != null && after != null ? after - before : null
  const detail = `FPS ${fps}, lowest ${lowest}, attacks ${director.meters.attacks}, particles ${director.meters.particles}, queue ${director.meters.queue}${growth == null ? '' : `, heap ${Math.round(growth / 1048576)} MB`}`
  if (fps < 30 || lowest < 30) setCheck('performance', 'fail', detail)
  else setCheck('performance', 'pass', detail)
}

export function PreflightPanel({ onEnableLive, onPrivateTest, onClose }: { onEnableLive: () => void; onPrivateTest: () => void; onClose: () => void }) {
  const version = usePreflightVersion()
  const snap = preflightSnapshot()
  const ready = canEnableLive()
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    void loadReport()
    void probeAudio()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (captureWindowOpen()) setCheck('capture', 'pass', 'Capture window is open')
      else if (preflightSnapshot().checks.capture === 'pass') setCheck('capture', 'fail', 'Capture window closed')
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const previousOverflow = document.body.style.overflow
    root.classList.add('preflight-open')
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      root.classList.remove('preflight-open')
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="preflight-backdrop" onClick={onClose}>
      <section
        className="preflight"
        data-version={version}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preflight-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="preflight-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="preflight-scroll">
          <header>
            <h2 id="preflight-heading">Pre-LIVE Check</h2>
            <p>LIVE stays off until every required row is PASS and you confirm the preview.</p>
          </header>
          <ol>
            {REQUIRED_CHECKS.map((check) => (
              <li key={check.id} className={`check-${snap.checks[check.id]}`}>
                <span>{labelFor(snap.checks[check.id])}</span>
                <strong>{check.label}</strong>
                <em>{snap.details[check.id]}</em>
              </li>
            ))}
          </ol>
          <div className="preflight-actions">
            <button type="button" onClick={runLocal}>Run local safety checks</button>
            <button type="button" onClick={onPrivateTest}>Test TikTok connection</button>
            <button type="button" onClick={() => void runPerformance()}>Run performance stress</button>
            <button type="button" onClick={() => void runAttackPass()}>Sample every attack</button>
          </div>
          <p className="preflight-confirm">{LIVE_CONFIRMATION}</p>
          <label className="preflight-box">
            <input type="checkbox" checked={snap.boxChecked} onChange={(event) => setPreviewBox(event.target.checked)} />
            I have looked at the capture window in TikTok LIVE Studio
          </label>
          <button type="button" disabled={!snap.boxChecked} onClick={() => confirmPreview()}>
            Confirm preview
          </button>
          <button type="button" className="preflight-live" disabled={!ready} onClick={onEnableLive}>
            Enable LIVE Mode
          </button>
          <div className="preflight-log">
            <h3>Private test event log</h3>
            {snap.log.length === 0 ? <p>No TikTok events recorded.</p> : snap.log.map((entry) => <p key={`${entry.at}-${entry.summary}`}>{entry.summary}</p>)}
          </div>
          <p className="preflight-meters">
            FPS {Math.round(director.meters.fps)} · lowest {Math.round(director.meters.lowestFps)} · particles {director.meters.particles} · attacks {director.meters.attacks} · players {director.meters.players} · queue {director.meters.queue}
          </p>
        </div>
      </section>
    </div>
  )
}

function labelFor(state: CheckState): string {
  if (state === 'pass') return 'PASS'
  if (state === 'fail') return 'FAIL'
  return 'NOT TESTED'
}

async function runAttackPass(): Promise<void> {
  director.battle.status = 'running'
  for (const team of ['red', 'blue'] as const) {
    for (const style of attackStyles) {
      director.previewAttack(style as AttackStyle, team, 8)
      await wait(styles[style].duration * 400)
    }
  }
  await wait(1200)
}
