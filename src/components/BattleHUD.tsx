import type { LeaderboardEntry } from '../types/Player.ts'
import { director } from '../systems/GameDirector.ts'
import { formatScore } from '../utils/format.ts'
import { Announcement } from './Announcement.tsx'
import { BattleTimer } from './BattleTimer.tsx'
import { ComboDisplay } from './ComboDisplay.tsx'
import { EventFeed } from './EventFeed.tsx'
import { Leaderboard } from './Leaderboard.tsx'
import { TeamHUD } from './TeamHUD.tsx'
import { useDirector } from './useDirector.ts'
import { VictoryScreen } from './VictoryScreen.tsx'

export function BattleHUD() {
  const hud = useDirector()
  return (
    <div className="hud">
      <header className="top-hud">
        <TeamHUD team={hud.red} side="left" />
        <BattleTimer hud={hud} />
        <TeamHUD team={hud.blue} side="right" />
      </header>
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
      <Announcement announcement={hud.announcement} />
      <div className={`bottom-stack ${hud.feed.length === 0 ? 'solo' : ''}`}>
        {hud.feed.length > 0 && <EventFeed items={hud.feed} />}
        <Leaderboard entries={hud.leaderboard} />
      </div>
      {hud.selected && <SelectedFighter player={hud.selected} />}
      <VictoryScreen victory={hud.victory} />
    </div>
  )
}

function SelectedFighter({ player }: { player: LeaderboardEntry }) {
  return (
    <aside className={`selected team-${player.team}`}>
      <img src={player.avatarUrl} alt="" />
      <div>
        <strong>@{player.username}</strong>
        <span>{player.team === 'red' ? 'Red' : 'Blue'}</span>
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
