import type { LeaderboardEntry } from '../types/Player.ts'
import { formatScore } from '../utils/format.ts'

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const ranked = entries.filter((entry) => entry.battlePoints > 0).slice(0, 3)
  const slots = [0, 1, 2].map((index) => ranked[index] ?? null)
  return (
    <section className="board" aria-label="Top">
      <header>
        Top
        <span>Claim your crown</span>
      </header>
      {slots.map((entry, index) =>
        entry ? (
          <div key={entry.id} className={`board-row team-${entry.team}${index === 0 ? ' boss' : ''}`}>
            <span className={`rank rank-${index + 1}`}>{index + 1}</span>
            <span className="boss-face">
              <img src={entry.avatarUrl} alt="" />
              <i className={`boss-crown crown-${index + 1}`} aria-hidden="true" />
            </span>
            <div>
              <strong>@{entry.username}</strong>
              <small>{formatScore(entry.battlePoints)}</small>
            </div>
          </div>
        ) : (
          <div key={`open-${index}`} className="board-row empty">
            <span className={`rank rank-${index + 1}`}>{index + 1}</span>
            <span className="boss-face" />
            <div>
              <strong>—</strong>
            </div>
          </div>
        ),
      )}
    </section>
  )
}
