import { useMemo, useState } from 'react'
import { tiktokGifts } from '../config/tiktokGifts.ts'
import { mockTikTok } from '../integrations/tiktok/MockTikTokAdapter.ts'
import { director } from '../systems/GameDirector.ts'
import type { TeamId } from '../types/Team.ts'
import type { WinCondition } from '../types/Battle.ts'
import type { TeamAssignMode } from '../types/Team.ts'
import { takeName } from '../utils/names.ts'
import { useDirector } from './useDirector.ts'

const QUICK = [
  { id: 'rose', label: 'Small gift', count: 1 },
  { id: 'sunglasses', label: 'Medium gift', count: 1 },
  { id: 'galaxy', label: 'Large gift', count: 1 },
  { id: 'universe', label: 'Legendary', count: 1 },
  { id: 'universe', label: 'Meteor', count: 1 },
  { id: 'whirlwind', label: 'Tornado', count: 1 },
  { id: 'sunglasses', label: 'Rocket', count: 1 },
  { id: 'thunder', label: 'Lightning', count: 1 },
  { id: 'rose', label: '100× combo', count: 100 },
] as const

let simSeq = 1

export function DeveloperPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const hud = useDirector()
  const roster = useMemo(() => [...director.players.players.values()].sort((a, b) => a.username.localeCompare(b.username)), [hud.epoch, hud.red.playerCount, hud.blue.playerCount])
  const [giftId, setGiftId] = useState('rose')
  const [team, setTeam] = useState<TeamId>('red')
  const [sender, setSender] = useState('random')
  const [quantity, setQuantity] = useState(1)
  const [seconds, setSeconds] = useState(Math.round(hud.durationMs / 1000))

  const send = (id: string, count: number, forcedTeam?: TeamId) => {
    const side = forcedTeam ?? team
    const gift = tiktokGifts.find((item) => item.id === id)
    const chosen = chooseSender(sender, side, roster)
    mockTikTok.emit({
      type: 'giftReceived',
      payload: {
        userId: chosen.id,
        username: chosen.username,
        avatarUrl: chosen.avatarUrl,
        team: chosen.team,
        giftId: id,
        giftName: gift?.name ?? id,
        giftCount: count,
        coinValue: gift?.coinValue,
        repeatEnd: true,
      },
    })
  }

  return (
    <aside className={`simulator ${open ? 'open' : ''}`} aria-hidden={!open}>
      <header>
        <div>
          <span>Simulator</span>
          <strong>TikTok events</strong>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <section>
        <h3>Battle</h3>
        <div className="sim-row">
          <button type="button" onClick={() => director.start()}>Start</button>
          <button type="button" onClick={() => director.pause()}>Pause</button>
          <button type="button" onClick={() => director.reset()}>Reset</button>
        </div>
        <label>
          Duration seconds
          <input
            type="number"
            min={15}
            max={1800}
            value={seconds}
            onChange={(event) => setSeconds(Number(event.target.value))}
          />
        </label>
        <div className="sim-row">
          <button type="button" onClick={() => director.setDuration(seconds)}>
            Apply duration
          </button>
          <button type="button" onClick={() => director.runForever()}>
            Forever
          </button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => director.jumpTo(35_000)}>Final rush</button>
          <button type="button" onClick={() => director.jumpTo(10_000)}>Final 10</button>
          <button type="button" onClick={() => director.stopBattle()}>Stop battle</button>
        </div>
        <label>
          Win rule
          <select value={hud.winCondition} onChange={(event) => director.setWinCondition(event.target.value as WinCondition)}>
            <option value="highest_score">Highest score</option>
            <option value="destroy_territory">Destroy territory</option>
          </select>
        </label>
        <label>
          Team assignment
          <select value={hud.teamAssignMode} onChange={(event) => director.setTeamAssignMode(event.target.value as TeamAssignMode)}>
            <option value="explicit">Explicit</option>
            <option value="random">Random</option>
            <option value="alternate">Alternate</option>
          </select>
        </label>
      </section>

      <section>
        <h3>Viewers</h3>
        <div className="sim-row">
          <button type="button" onClick={() => join('red')}>Add red</button>
          <button type="button" onClick={() => join('blue')}>Add blue</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => director.addRandom(20)}>Add 20</button>
          <button type="button" onClick={() => director.addRandom(100)}>Add 100</button>
        </div>
      </section>

      <section>
        <h3>Social</h3>
        <div className="sim-row">
          <button type="button" onClick={() => burst(team, 100)}>100 likes</button>
          <button type="button" onClick={() => burst(team, 500)}>500 likes</button>
          <button type="button" onClick={() => burst(team, 1000)}>1,000 likes</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => social('follow', team)}>Follow</button>
          <button type="button" onClick={() => social('share', team)}>Share</button>
        </div>
      </section>

      <section>
        <h3>Gift</h3>
        <label>
          Gift
          <select value={giftId} onChange={(event) => setGiftId(event.target.value)}>
            {tiktokGifts.map((gift) => (
              <option key={gift.id} value={gift.id}>
                {gift.displayName} · {gift.coinValue}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sender
          <select value={sender} onChange={(event) => setSender(event.target.value)}>
            <option value="random">Random teammate</option>
            <option value="new">New viewer</option>
            {roster.map((player) => (
              <option key={player.id} value={player.id}>
                @{player.username} · {player.team}
              </option>
            ))}
          </select>
        </label>
        <label>
          Team for new events
          <select value={team} onChange={(event) => setTeam(event.target.value as TeamId)}>
            <option value="red">Red</option>
            <option value="blue">Blue</option>
          </select>
        </label>
        <div className="quantities">
          {[1, 2, 5, 10, 25, 50, 100].map((count) => (
            <button key={count} type="button" className={quantity === count ? 'on' : ''} onClick={() => setQuantity(count)}>
              {count}
            </button>
          ))}
        </div>
        <button type="button" className="send" onClick={() => send(giftId, quantity)}>
          Send gift
        </button>
        <div className="quick">
          {QUICK.map((item) => (
            <button key={item.label} type="button" onClick={() => send(item.id, item.count)}>
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const chosen = chooseSender('random', team, roster)
              mockTikTok.emit({
                type: 'giftReceived',
                payload: {
                  userId: chosen.id,
                  username: chosen.username,
                  avatarUrl: chosen.avatarUrl,
                  team: chosen.team,
                  giftId: 'unlisted_gift',
                  giftName: 'Mystery Drop',
                  giftCount: 1,
                  coinValue: 2500,
                },
              })
            }}
          >
            Unknown gift
          </button>
        </div>
      </section>
    </aside>
  )
}

function join(team: TeamId): void {
  const username = takeName()
  mockTikTok.emit({
    type: 'viewerJoined',
    payload: { userId: `sim-${simSeq++}`, username, avatarUrl: '', team },
  })
}

function burst(team: TeamId, count: number): void {
  mockTikTok.emit({
    type: 'likeReceived',
    payload: { userId: 'crowd', username: 'crowd', avatarUrl: '', team, count },
  })
}

function social(kind: 'follow' | 'share', team: TeamId): void {
  const username = takeName()
  if (kind === 'follow') {
    mockTikTok.emit({
      type: 'followReceived',
      payload: { userId: `sim-${simSeq++}`, username, avatarUrl: '', team },
    })
    return
  }
  mockTikTok.emit({
    type: 'shareReceived',
    payload: { userId: `sim-${simSeq++}`, username, avatarUrl: '', team },
  })
}

function chooseSender(
  sender: string,
  team: TeamId,
  roster: { id: string; username: string; avatarUrl: string; team: TeamId }[],
): { id: string; username: string; avatarUrl: string; team: TeamId } {
  if (sender !== 'random' && sender !== 'new') {
    const found = roster.find((player) => player.id === sender)
    if (found) return found
  }
  if (sender === 'random') {
    const mates = roster.filter((player) => player.team === team)
    const pool = mates.length > 0 ? mates : roster
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)]!
  }
  const username = takeName()
  const created = { id: `sim-${simSeq++}`, username, avatarUrl: '', team }
  mockTikTok.emit({
    type: 'viewerJoined',
    payload: {
      userId: created.id,
      username: created.username,
      avatarUrl: created.avatarUrl,
      team: created.team,
    },
  })
  return created
}
