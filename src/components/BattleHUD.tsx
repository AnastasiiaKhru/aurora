import type { LeaderboardEntry } from '../types/Player.ts'
import { director } from '../systems/GameDirector.ts'
import { formatScore } from '../utils/format.ts'
import { BattleTimer } from './BattleTimer.tsx'
import { ComboDisplay } from './ComboDisplay.tsx'
import { HelpActions, JoinPrompt } from './PowerGuide.tsx'
import { TeamHUD } from './TeamHUD.tsx'
import { useDirector } from './useDirector.ts'
import { CountdownOverlay } from './CountdownOverlay.tsx'
import { VictoryScreen } from './VictoryScreen.tsx'
import { SafeZoneGuide } from './SafeZoneGuide.tsx'
import type { PowerFlash } from '../types/Battle.ts'

export function BattleHUD({ showSafeZones = false, showTikTokPreview = false }: { showSafeZones?: boolean; showTikTokPreview?: boolean }) {
  const hud = useDirector()
  return (
    <div className="hud">
      <header className="top-hud scoreboard">
        <TeamHUD team={hud.red} side="left" />
        <BattleTimer hud={hud} />
        <TeamHUD team={hud.blue} side="right" />
      </header>
      <JoinPrompt />
      <HelpActions />
      <ReservePills />
      <PowerNotice flash={hud.powerFlash} />
      {hud.rush && (
        <div key={hud.rush.id} className={`rush team-${hud.rush.team}`}>
          {hud.rush.label}
        </div>
      )}
      {hud.finalTen && hud.phase === 'final_10' && (
        <div key={hud.finalTen.nonce} className="final-ten">
          {hud.finalTen.value}
        </div>
      )}
      <ComboDisplay combos={hud.combos} />
      {hud.selected && <SelectedFighter player={hud.selected} />}
      <VictoryScreen victory={hud.victory} elapsed={hud.victoryMs} />
      <CountdownOverlay countdown={hud.countdown} />
      <SafeZoneGuide zones={showSafeZones} preview={showTikTokPreview} />
    </div>
  )
}

function ReservePills() {
  const red = director.players.reserves.red
  const blue = director.players.reserves.blue
  if (red <= 0 && blue <= 0) return null
  return (
    <>
      {red > 0 && <span className="reserve-pill side-left">+{red}</span>}
      {blue > 0 && <span className="reserve-pill side-right">+{blue}</span>}
    </>
  )
}

function PowerNotice({ flash }: { flash: PowerFlash | null }) {
  if (!flash) return null
  return (
    <div key={flash.id} className="power-notice" role="status">
      {flash.image ? <img src={flash.image} alt="" /> : <span>{flash.icon}</span>}
      <strong>{flash.name}</strong>
      <em>{flash.attack}</em>
    </div>
  )
}

function SelectedFighter({ player }: { player: LeaderboardEntry }) {
  return (
    <aside className={`selected team-${player.team}`}>
      <img src={player.avatarUrl} alt="" />
      <div>
        <strong>@{player.username}</strong>
        <span>{player.team === 'red' ? 'Canada' : 'USA'}</span>
        <p>
          {formatScore(player.battlePoints)} pts · {formatScore(player.damageDealt)} damage · {player.giftCount} gifts ·{' '}
          {player.largestCombo}× combo
        </p>
      </div>
      <button type="button" onClick={() => director.clearSelection()}>
        Close
      </button>
    </aside>
  )
}
