import type { VictoryState } from '../types/Battle.ts'
import { formatScore } from '../utils/format.ts'
import { useAnimatedNumber } from './useAnimatedNumber.ts'

export function VictoryScreen({ victory }: { victory: VictoryState | null }) {
  if (!victory) return null
  return (
    <div className={`victory result-${victory.result}`}>
      <div className="victory-card">
        <p className="victory-kicker">{victory.result === 'draw' ? 'Balance held' : 'Battle decided'}</p>
        <h2>{victory.result === 'draw' ? 'Drawn' : `${victory.result === 'red' ? 'Red' : 'Blue'} Team`}</h2>
        <p className="victory-word">{victory.result === 'draw' ? 'Stalemate' : 'Victory'}</p>
        <ScoreRow victory={victory} />
        {victory.mvp && (
          <div className="mvp">
            <div className="mvp-frame">
              <img src={victory.mvp.avatarUrl} alt="" />
              <Crown />
            </div>
            <div>
              <span>MVP</span>
              <strong>@{victory.mvp.username}</strong>
              <small>
                {formatScore(victory.mvp.battlePoints)} pts · {victory.mvp.giftCount} gifts · {victory.mvp.largestCombo}×
              </small>
            </div>
          </div>
        )}
        <div className="podium">
          {victory.top.filter((entry) => entry.battlePoints > 0).map((entry, index) => (
            <div key={entry.id} className={`podium-card team-${entry.team}`}>
              <em>{index + 1}</em>
              <img src={entry.avatarUrl} alt="" />
              <strong>@{entry.username}</strong>
              <small>{formatScore(entry.battlePoints)}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ScoreRow({ victory }: { victory: VictoryState }) {
  const red = useAnimatedNumber(victory.redScore, 900)
  const blue = useAnimatedNumber(victory.blueScore, 900)
  return (
    <div className="victory-scores">
      <div>
        <span>Red</span>
        <strong>{formatScore(red)}</strong>
      </div>
      <div>
        <span>Blue</span>
        <strong>{formatScore(blue)}</strong>
      </div>
    </div>
  )
}

function Crown() {
  return (
    <svg className="crown" viewBox="0 0 64 36" aria-hidden="true">
      <path d="M4 30h56L52 8l-12 10L32 4 24 18 12 8 4 30z" />
    </svg>
  )
}
