import { battleConfig } from '../config/battleConfig.ts'
import type { VictoryState } from '../types/Battle.ts'
import type { LeaderboardEntry } from '../types/Player.ts'
import { formatScore } from '../utils/format.ts'

export function VictoryScreen({ victory, elapsed = 0 }: { victory: VictoryState | null; elapsed?: number }) {
  if (!victory) return null
  const side = victory.result === 'draw' ? null : victory.result
  const name = side ? battleConfig.teamNames[side] : 'Drawn'
  const [mvp, ...runners] = victory.top
  const closing = elapsed >= 8_000
  const beat = !closing ? null : elapsed < 9_000 ? 3 : elapsed < 10_000 ? 2 : 1
  return (
    <div className={`victory result-${victory.result}`} role="status" aria-live="assertive">
      <div className="victory-sweep" />
      <div className="victory-card">
        <p className="victory-kicker">Victory</p>
        <h2>
          {side && <Mark team={side} />}
          <span>{side ? `${name} wins!` : 'Balance held'}</span>
        </h2>
        {mvp ? <Mvp player={mvp} /> : <p className="victory-empty">No ranked players this round</p>}
        {runners.length > 0 && (
          <div className="victory-runners">
            {runners.map((player, index) => (
              <Runner key={player.id} player={player} place={index + 2} />
            ))}
          </div>
        )}
        {beat != null && (
          <p className="victory-next" key={beat}>
            <span>Next battle in</span>
            <strong>{beat}</strong>
          </p>
        )}
      </div>
    </div>
  )
}

function Mvp({ player }: { player: LeaderboardEntry }) {
  return (
    <div className="victory-mvp">
      <div className="victory-mvp-frame">
        <Crown />
        <Face player={player} />
        <i className="victory-spark a" />
        <i className="victory-spark b" />
        <i className="victory-spark c" />
        <i className="victory-spark d" />
      </div>
      <p>Battle MVP</p>
      <strong>
        <Flag team={player.team} />@{player.username}
      </strong>
      <span>{formatScore(player.battlePoints)}</span>
    </div>
  )
}

function Runner({ player, place }: { player: LeaderboardEntry; place: number }) {
  return (
    <div className={`victory-runner place-${place}`}>
      <em>#{place}</em>
      <span className="runner-face">
        <Crown place={place} />
        <Face player={player} />
      </span>
      <strong>
        <Flag team={player.team} />@{player.username}
      </strong>
      <span>{formatScore(player.battlePoints)}</span>
    </div>
  )
}

function Face({ player }: { player: LeaderboardEntry }) {
  if (player.avatarUrl) return <img src={player.avatarUrl} alt="" />
  return <b>{player.initials}</b>
}

function Flag({ team }: { team: 'red' | 'blue' }) {
  return <span className="victory-flag">{team === 'red' ? '🇨🇦' : '🇺🇸'}</span>
}

function Mark({ team }: { team: 'red' | 'blue' }) {
  if (team === 'red') return <img className="victory-mark" src="/maple-leaf.png" alt="" />
  return <UsaStar />
}

function Crown({ place = 1 }: { place?: number }) {
  const jewel = place === 2 ? '#4eb6ff' : place === 3 ? '#ffe08a' : '#ff2d4a'
  return (
    <svg className={`victory-crown place-${place}`} viewBox="0 0 64 40" aria-hidden="true">
      <path fill="currentColor" d="M4 34h56l-3.2-18.5-10.6 8.2L32 4 17.8 23.7 7.2 15.5 4 34z" />
      <path fill="#fff6d8" fillOpacity="0.55" d="M16 31.5h32l-1.4-6.2H17.4L16 31.5z" />
      <circle cx="32" cy="27.2" r="3.1" fill={jewel} />
      <circle cx="14.5" cy="16.2" r="2" fill="#fff8e8" />
      <circle cx="32" cy="7.4" r="2.2" fill="#fff8e8" />
      <circle cx="49.5" cy="16.2" r="2" fill="#fff8e8" />
    </svg>
  )
}

function UsaStar() {
  return (
    <svg className="victory-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M8 1.2 9.7 5.4 14.2 5.7 10.8 8.6 11.9 13 8 10.7 4.1 13 5.2 8.6 1.8 5.7 6.3 5.4 8 1.2z" />
    </svg>
  )
}
