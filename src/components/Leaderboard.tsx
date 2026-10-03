import type { LeaderboardEntry } from '../types/Player.ts'
import { formatScore } from '../utils/format.ts'

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const ranked = entries.filter((entry) => entry.battlePoints > 0).slice(0, 3)
  return (
    <section className="board" aria-label="Top contributors">
      <header>Top</header>
      {ranked.length === 0 && <p className="board-empty">Waiting for the first gift</p>}
      {ranked.map((entry, index) => (
        <div key={entry.id} className={`board-row team-${entry.team}`}>
          <span className="rank">{index + 1}</span>
          <img src={entry.avatarUrl} alt="" />
          <div>
            <strong>@{entry.username}</strong>
            <small>{formatScore(entry.battlePoints)}</small>
          </div>
        </div>
      ))}
    </section>
  )
}
