import type { HudSnapshot } from '../types/Battle.ts'

export function BattleTimer({ hud }: { hud: HudSnapshot }) {
  return (
    <div className={`timer phase-normal status-${hud.status}`}>
      <div className="vs-mark" aria-hidden="true">
        <span className="vs-crown" />
        <span className="vs-letters">VS</span>
        <i className="vs-spark s1" />
        <i className="vs-spark s2" />
        <i className="vs-spark s3" />
      </div>
      {hud.status === 'paused' && <div className="timer-flag">Paused</div>}
    </div>
  )
}
