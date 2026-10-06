import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Battlefield } from './game/Battlefield.tsx'
import { BattleHUD } from './components/BattleHUD.tsx'
import { DeveloperPanel } from './components/DeveloperPanel.tsx'
import { TikTokStatus } from './components/TikTokStatus.tsx'
import { useDirector } from './components/useDirector.ts'
import { attachTikTokAdapter } from './integrations/tiktok/index.ts'
import { LiveTikTokAdapter, tiktokSocketUrl } from './integrations/tiktok/LiveTikTokAdapter.ts'
import { mockTikTok } from './integrations/tiktok/MockTikTokAdapter.ts'
import type { LiveChatPayload, LiveLinkPhase, LiveLinkStatus } from './integrations/tiktok/liveMessages.ts'
import { DESIGN_HEIGHT, DESIGN_WIDTH, broadcastScale, fitCaptureWindow, isCaptureMode, openCaptureWindow } from './broadcast/stage.ts'
import { director } from './systems/GameDirector.ts'
import { MusicStatusIndicator } from './components/MusicStatusIndicator.tsx'
import { PreflightPanel } from './components/PreflightPanel.tsx'
import type { TikTokLiveEvent } from './integrations/tiktok/TikTokEventTypes.ts'
import { canEnableLive, noteConsoleError, preflightVersion, recordLiveEvent, setBroadcastMode, setCheck, subscribePreflight } from './preflight/session.ts'

type SourceMode = 'simulator' | 'private' | 'live'

function describeLiveEvent(event: TikTokLiveEvent): string {
  if (event.type === 'viewerJoined') return `@${event.payload.username} joined ${event.payload.team}`
  if (event.type === 'viewerLeft') return `@${event.payload.username} left`
  if (event.type === 'likeReceived') return `@${event.payload.username} liked ${event.payload.count}`
  if (event.type === 'followReceived') return `@${event.payload.username} followed`
  if (event.type === 'shareReceived') return `@${event.payload.username} shared`
  if (event.type === 'commentReceived') return `@${event.payload.username}: ${event.payload.text}`
  return `@${event.payload.username} sent ${event.payload.giftName} x${event.payload.giftCount}`
}

function isAdminRoute(): boolean {
  return window.location.pathname.replace(/\/+$/, '').endsWith('/admin')
}

export function App() {
  return isAdminRoute() ? <AdminView /> : <BattleView />
}

function BroadcastFrame({ className, children, native = false }: { className: string; children: ReactNode; native?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const apply = () => {
      if (native) {
        stage.style.transform = 'none'
        return
      }
      const scale = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT)
      stage.style.transform = `scale(${scale})`
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [native])

  return (
    <div className={className}>
      <div className="broadcast-stage" ref={stageRef} style={native ? { transform: 'none' } : { transform: `scale(${broadcastScale()})` }}>
        {children}
      </div>
    </div>
  )
}

function BattleView() {
  const hud = useDirector()
  const capture = isCaptureMode()
  const [cursorHidden, setCursorHidden] = useState(false)

  useEffect(() => {
    if (!capture) return
    const root = document.documentElement
    const viewport = document.querySelector('meta[name="viewport"]')
    const previous = viewport?.getAttribute('content') ?? ''
    viewport?.setAttribute('content', 'width=1080, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no')
    root.classList.add('capture-lock')
    fitCaptureWindow()
    window.addEventListener('resize', fitCaptureWindow)
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault()
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '-' || event.key === '=' || event.key === '0')) event.preventDefault()
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      root.classList.remove('capture-lock')
      if (previous) viewport?.setAttribute('content', previous)
      window.removeEventListener('resize', fitCaptureWindow)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [capture])

  useEffect(() => {
    if (!capture) return
    let timer = window.setTimeout(() => setCursorHidden(true), 2000)
    const move = () => {
      setCursorHidden(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setCursorHidden(true), 2000)
    }
    window.addEventListener('pointermove', move)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', move)
    }
  }, [capture])

  useEffect(() => {
    director.sound.enterBattle()
    director.startLoop()
    let stop = () => {}
    const connect = () => {
      stop()
      stop = () => {}
      if (!director.leading) return
      const live = new LiveTikTokAdapter(tiktokSocketUrl())
      const detach = attachTikTokAdapter(live)
      stop = () => {
        detach()
        live.stop()
      }
    }
    const unsub = director.onRole(connect)
    connect()
    director.reclaim()
    director.players.layoutAll()
    return () => {
      unsub()
      stop()
      director.sound.leaveBattle()
      director.stopLoop()
    }
  }, [])

  return (
    <BroadcastFrame native={capture} className={`broadcast-viewport shell-live${capture ? ' capture' : ''}${cursorHidden ? ' cursor-hidden' : ''}`}>
      <div className="stage" id="aurora-stage" data-phase={hud.phase} data-status={hud.status} data-count={hud.countdown?.label ?? ''}>
        <Battlefield />
        <BattleHUD />
      </div>
    </BroadcastFrame>
  )
}

function AdminView() {
  const hud = useDirector()
  const [open, setOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(true)
  const [mode, setMode] = useState<SourceMode>('simulator')
  const [link, setLink] = useState<LiveLinkStatus>({ phase: 'offline', username: '', roomId: '', detail: 'Simulator' })
  const [chat, setChat] = useState<LiveChatPayload[]>([])
  const [safeZones, setSafeZones] = useState(false)
  const [tiktokPreview, setTiktokPreview] = useState(false)
  const liveGate = useSyncExternalStore(subscribePreflight, preflightVersion, preflightVersion)

  useEffect(() => {
    director.sound.enterAdmin()
    const onError = () => noteConsoleError()
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onError)
    return () => {
      director.sound.leaveAdmin()
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onError)
    }
  }, [])

  useEffect(() => {
    director.startLoop()
    setBroadcastMode(mode)
    let stop = () => {}
    const connect = () => {
      stop()
      stop = () => {}
      if (mode === 'simulator') {
        const detach = attachTikTokAdapter(mockTikTok)
        stop = detach
        setLink({ phase: 'offline', username: '', roomId: '', detail: 'Simulator' })
        return
      }
      if (!director.leading) return
      const live = new LiveTikTokAdapter(tiktokSocketUrl())
      const detach = attachTikTokAdapter(live)
      const detachStatus = live.onStatus(setLink)
      const detachChat = live.onChat((entry) => setChat((current) => [entry, ...current].slice(0, 6)))
      const detachLog = live.on((event) => {
        if (mode === 'private') recordLiveEvent(describeLiveEvent(event))
      })
      stop = () => {
        detach()
        detachStatus()
        detachChat()
        detachLog()
        live.stop()
      }
    }
    connect()
    const unsub = director.onRole(connect)
    return () => {
      unsub()
      stop()
      director.stopLoop()
    }
  }, [mode])

  useEffect(() => {
    if (mode === 'simulator') return
    if (link.phase === 'live') {
      setCheck('tiktok', 'pass', link.detail || 'TikTok connected')
      setCheck('websocket', 'pass', 'Bridge socket is live')
      return
    }
    if (link.phase === 'offline') {
      setCheck('tiktok', 'fail', link.detail || 'TikTok did not connect')
      setCheck('websocket', 'fail', link.detail || 'Socket offline')
    }
  }, [mode, link])

  const phase: LiveLinkPhase | 'simulator' = mode === 'simulator' ? 'simulator' : link.phase
  const statusDetail = mode === 'simulator' ? 'Simulator' : mode === 'private' ? `TEST MODE · ${link.detail}` : link.detail

  const enableLive = () => {
    if (!canEnableLive()) return
    director.reset()
    setMode('live')
  }

  return (
    <div className="shell">
      <MusicStatusIndicator />
      <BroadcastFrame className="broadcast-viewport shell-live">
        <div className="stage" id="aurora-stage" data-phase={hud.phase} data-status={hud.status} data-count={hud.countdown?.label ?? ''}>
          <Battlefield />
          <BattleHUD showSafeZones={safeZones} showTikTokPreview={tiktokPreview} />
        </div>
      </BroadcastFrame>
      {mode === 'private' && <div className="test-mode-banner">TEST MODE</div>}
      <div className="chrome">
        <TikTokStatus phase={phase} detail={statusDetail} />
        <button type="button" className={`chrome-btn ${mode === 'simulator' ? 'on' : ''}`} onClick={() => setMode('simulator')}>
          Simulator
        </button>
        <button type="button" className={`chrome-btn ${mode === 'private' ? 'on' : ''}`} onClick={() => setMode('private')}>
          Private test
        </button>
        <button type="button" className={`chrome-btn ${mode === 'live' ? 'on' : ''}`} disabled={mode !== 'live' && !canEnableLive()} data-gate={liveGate} onClick={enableLive}>
          LIVE
        </button>
        <button type="button" className="chrome-btn" onClick={() => director.reset()}>
          New battle
        </button>
        {hud.status === 'running' && (
          <button type="button" className="chrome-btn stop" onClick={() => director.stopBattle()}>
            Stop
          </button>
        )}
        <button type="button" className="chrome-btn" onClick={() => director.endRound('blue')}>
          END RED
        </button>
        <button type="button" className="chrome-btn" onClick={() => director.endRound('red')}>
          END BLUE
        </button>
        <button type="button" className="chrome-btn" onClick={() => director.resetRound()}>
          RESET ROUND
        </button>
        <button type="button" className="chrome-btn" onClick={() => director.skipVictory()}>
          NEXT ROUND
        </button>
        <button type="button" className="chrome-btn" onClick={() => director.toggleMute()}>
          {hud.muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className={`chrome-btn sim-toggle ${open ? 'on' : ''}`} onClick={() => setOpen((value) => !value)}>
          Controls
        </button>
        <a className="chrome-btn" href="/battle">
          Clean view
        </a>
        <button type="button" className="chrome-btn" onClick={() => openCaptureWindow()}>
          Open TikTok Capture Window
        </button>
        <button type="button" className={`chrome-btn ${safeZones ? 'on' : ''}`} onClick={() => setSafeZones((value) => !value)}>
          Show TikTok Safe Zones
        </button>
        <button type="button" className={`chrome-btn ${tiktokPreview ? 'on' : ''}`} onClick={() => setTiktokPreview((value) => !value)}>
          TikTok overlay preview
        </button>
      </div>
      {mode !== 'simulator' && chat.length > 0 && (
        <div className="live-log">
          {chat.map((entry) => (
            <p key={`${entry.userId}-${entry.text}`}>
              @{entry.username}: {entry.text}
            </p>
          ))}
        </div>
      )}
      {preflightOpen ? (
        <PreflightPanel onEnableLive={enableLive} onPrivateTest={() => setMode('private')} onClose={() => setPreflightOpen(false)} />
      ) : (
        <button type="button" className="chrome-btn preflight-reopen" onClick={() => setPreflightOpen(true)}>
          Pre-LIVE Check
        </button>
      )}
      <DeveloperPanel open={open} locked={mode !== 'simulator'} onClose={() => setOpen(false)} />
    </div>
  )
}
