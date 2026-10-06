import { battleConfig } from '../config/battleConfig.ts'
import type { VictoryState } from '../types/Battle.ts'
import { formatScore } from '../utils/format.ts'

const PLACES = ['1', '2', '3']

export function VictoryScreen({ victory }: { victory: VictoryState | null }) {
  if (!victory) return null
  const side = victory.result === 'draw' ? null : victory.result
  const name = side ? battleConfig.teamNames[side] : 'Drawn'
  return (
    <div className={`victory result-${victory.result}`} role="status" aria-live="assertive">
      <div className="victory-sweep" />
      <div className="victory-card">
        {(victory.portraits ?? []).length > 0 && (
          <div className="victory-portraits">
            {(victory.portraits ?? []).map((portrait) => (
              <img key={portrait.id} src={portrait.avatarUrl} alt="" title={portrait.username} />
            ))}
          </div>
        )}
        <p className="victory-kicker">Victory</p>
        <h2>
          {side && <Mark team={side} />}
          <span>{side ? `${side === 'red' ? 'RED' : 'BLUE'} TEAM WINS!` : 'Balance held'}</span>
        </h2>
        {side && <p className="victory-congrats">Congratulations team {name}</p>}
        {victory.top.length > 0 && (
          <div className="victory-honors">
            <p className="victory-kicker">Round MVP</p>
            <ol>
              {victory.top.map((entry, index) => (
                <li key={entry.id}>
                  <em>{PLACES[index]}</em>
                  <img src={entry.avatarUrl} alt="" />
                  <strong>@{entry.username}</strong>
                  <span>{formatScore(entry.battlePoints)} power</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="victory-peace">
          Great battle
          <img src="/maple-leaf.png" alt="" />
          <UsaStar />
        </p>
      </div>
    </div>
  )
}

function Mark({ team }: { team: 'red' | 'blue' }) {
  if (team === 'red') return <img className="victory-mark" src="/maple-leaf.png" alt="" />
  return <UsaStar />
}

function UsaStar() {
  return (
    <svg className="victory-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M8 1.2 9.7 5.4 14.2 5.7 10.8 8.6 11.9 13 8 10.7 4.1 13 5.2 8.6 1.8 5.7 6.3 5.4 8 1.2z" />
    </svg>
  )
}
