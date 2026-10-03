import { useEffect, useState } from 'react'
import { Battlefield } from './game/Battlefield.tsx'
import { BattleHUD } from './components/BattleHUD.tsx'
import { DeveloperPanel } from './components/DeveloperPanel.tsx'
import { useDirector } from './components/useDirector.ts'
import { attachTikTokAdapter } from './integrations/tiktok/index.ts'
import { mockTikTok } from './integrations/tiktok/MockTikTokAdapter.ts'
import { director } from './systems/GameDirector.ts'

export function App() {
  const hud = useDirector()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const detach = attachTikTokAdapter(mockTikTok)
    director.startLoop()
    return () => {
      detach()
      director.stopLoop()
    }
  }, [])

  return (
    <div className="shell">
      <div className="stage" id="aurora-stage" data-phase={hud.phase} data-status={hud.status}>
        <Battlefield />
        <BattleHUD />
      </div>
      <div className="chrome">
        {hud.status === 'finished' ? (
          <button type="button" className="chrome-btn" onClick={() => director.reset()}>
            New battle
          </button>
        ) : (
          <button type="button" className="chrome-btn stop" onClick={() => director.stopBattle()} disabled={hud.status === 'finishing'}>
            Stop
          </button>
        )}
        <button type="button" className="chrome-btn" onClick={() => director.toggleMute()}>
          {hud.muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className={`chrome-btn sim-toggle ${open ? 'on' : ''}`} onClick={() => setOpen((value) => !value)}>
          Simulator
        </button>
      </div>
      <DeveloperPanel open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
