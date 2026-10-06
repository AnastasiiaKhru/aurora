import type { HudSnapshot } from '../types/Battle.ts'
import { formatClock, formatElapsed } from '../utils/format.ts'

export function BattleTimer({ hud }: { hud: HudSnapshot }) {
  const clock = hud.endless ? formatElapsed(hud.elapsedMs) : formatClock(hud.timeLeftMs)
  return (
    <div className={`timer phase-${hud.phase} status-${hud.status}`}>
      <div className="clock">{clock}</div>
      {hud.phase === 'final_rush' && <div className="timer-flag">Final Rush</div>}
      {hud.phase === 'final_10' && <div className="timer-flag hot">Final</div>}
      {hud.status === 'paused' && <div className="timer-flag">Paused</div>}
    </div>
  )
}
