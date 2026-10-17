import { battleConfig } from '../config/battleConfig.ts'
import type { LeaderboardEntry } from '../types/Player.ts'
import type { TeamState } from '../types/Team.ts'
import { director } from '../systems/GameDirector.ts'
import { teamHealthBar } from '../systems/BattleSystem.ts'
import { formatScore } from '../utils/format.ts'
import { BattleTimer } from './BattleTimer.tsx'
import { ComboDisplay } from './ComboDisplay.tsx'
import { HelpActions, JoinPrompt } from './PowerGuide.tsx'
import { useDirector } from './useDirector.ts'
import { CountdownOverlay } from './CountdownOverlay.tsx'
import { VictoryScreen } from './VictoryScreen.tsx'
import { SafeZoneGuide } from './SafeZoneGuide.tsx'
import type { PowerFlash } from '../types/Battle.ts'

export function BattleHUD({ showSafeZones = false, showTikTokPreview = false }: { showSafeZones?: boolean; showTikTokPreview?: boolean }) {
  const hud = useDirector()
  return (
    <div className="hud">
      <PosterTop red={hud.red} blue={hud.blue} />
      <PosterBottom />
      <BattleTimer hud={hud} />
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
        <span>{battleConfig.teamNames[player.team]}</span>
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

function PosterTop({ red, blue }: { red: TeamState; blue: TeamState }) {
  return (
    <header className="poster-top">
      <div className="poster-meters">
        <Meter team={red} side="left" />
        <div className="poster-vs" aria-hidden="true">
          <i>👑</i>
          VS
        </div>
        <Meter team={blue} side="right" />
      </div>
      <div className="poster-banners">
        <p className="poster-ribbon side-red">
          <span className="sign-mark" aria-hidden="true">
            <span>🧻</span>
            <b className="join-key">A</b>
          </span>
          <em>
            NO TOILET PAPER
            <br />
            FOR A MONTH
          </em>
        </p>
        <p className="poster-sign">
          WOULD YOU
          <br />
          RATHER? <span aria-hidden="true">😂</span>
        </p>
        <p className="poster-ribbon side-blue">
          <span className="sign-mark" aria-hidden="true">
            <span>📵</span>
            <b className="join-key">B</b>
          </span>
          <em>
            NO PHONE
            <br />
            FOR A MONTH
          </em>
        </p>
      </div>
      <p className="overlay-disclosure">Game overlay · generated art</p>
    </header>
  )
}

function Meter({ team, side }: { team: TeamState; side: 'left' | 'right' }) {
  const fill = teamHealthBar(team.health, team.maxHealth)
  const shown = meterLabel(team.health, team.maxHealth)
  return (
    <div className={`poster-meter side-${side}`}>
      <span className="poster-orb" aria-hidden="true">{side === 'left' ? '🧻' : '📵'}</span>
      <div className="poster-bar" aria-label={shown}>
        <i style={{ width: `${fill}%` }} />
        <b>{shown}</b>
      </div>
    </div>
  )
}

/** 100 only at full HP, 0 only at empty. Hundredths so a hit moves both top plates. */
function meterLabel(health: number, maxHealth: number): string {
  if (!(maxHealth > 0) || !(health > 0)) return '0%'
  if (health >= maxHealth) return '100%'
  const hundredths = Math.floor((health / maxHealth) * 10000 + 1e-6)
  const shown = Math.min(9999, Math.max(1, hundredths)) / 100
  return `${shown.toFixed(2)}%`
}

function PosterBottom() {
  return (
    <footer className="poster-bottom">
      <div className="poster-alisa">
        <img src="/alisa-sticker.png" alt="" />
        <p>
          Hi! I'm Alisa 👋
          <br />
          <span className="alisa-hand">I built this game!</span>
        </p>
      </div>
    </footer>
  )
}
