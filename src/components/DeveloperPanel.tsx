import { useEffect, useMemo, useState } from 'react'
import { tiktokGifts } from '../config/tiktokGifts.ts'
import { attackLab, type AttackQuality } from '../game/attacks/lab.ts'
import { attackStyles, type AttackStyle } from '../game/attacks/style.ts'
import { teamCommand } from '../utils/team.ts'
import { mockTikTok } from '../integrations/tiktok/MockTikTokAdapter.ts'
import { formatAudioTime, type MusicStatus } from '../audio/MusicController.ts'
import { attractModeConfig } from '../systems/attractMode.ts'
import { director } from '../systems/GameDirector.ts'
import { motionDebug } from '../systems/playerMotion.ts'
import type { SfxName } from '../systems/SoundSystem.ts'
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

const ATTACK_LABELS: Record<AttackStyle, string> = {
  pulse: 'Aurora Pulse',
  comet: 'Crown Comet',
  portal: 'Mirror Portal Swarm',
  rose: 'Living Rose Strike',
  maple: 'Maple Meteor',
  star: 'Constellation Cannon',
  vortex: 'Aurora Vortex',
  planet: 'Orbital Collision',
  crystal: 'Crystal Kingdom Breaker',
  eclipse: 'Aurora Eclipse',
}

let simSeq = 1
let lastSubject: { id: string; username: string; avatarUrl: string; team: TeamId } | null = null
let eliminated: { id: string; username: string; avatarUrl: string; team: TeamId } | null = null

export function DeveloperPanel({ open, onClose, locked = false }: { open: boolean; onClose: () => void; locked?: boolean }) {
  const hud = useDirector()
  const roster = useMemo(() => [...director.players.players.values()].sort((a, b) => a.username.localeCompare(b.username)), [hud.epoch, hud.red.playerCount, hud.blue.playerCount])
  const [giftId, setGiftId] = useState('rose')
  const [team, setTeam] = useState<TeamId>('red')
  const [sender, setSender] = useState('random')
  const [quantity, setQuantity] = useState(1)
  const [seconds, setSeconds] = useState(Math.round(hud.durationMs / 1000))
  const [attackTeam, setAttackTeam] = useState<TeamId>('red')
  const [attackDamage, setAttackDamage] = useState(48)
  const [attackSpeed, setAttackSpeed] = useState(attackLab.speed)
  const [attackDensity, setAttackDensity] = useState(attackLab.density)
  const [attackShake, setAttackShake] = useState(attackLab.shake)
  const [attackVolume, setAttackVolume] = useState(attackLab.volume)
  const [attackQuality, setAttackQuality] = useState<AttackQuality>(attackLab.quality)

  const send = (id: string, count: number, forcedTeam?: TeamId) => {
    if (locked) return
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
      {locked && <p className="sim-lock">Simulator is paused while Live TikTok is on.</p>}

      <section>
        <h3>Attract Mode</h3>
        <div className="sim-row">
          <button type="button" onClick={() => director.setAttractEnabled(!attractModeConfig.enabled)}>
            {attractModeConfig.enabled ? 'Disable Attract Mode' : 'Enable Attract Mode'}
          </button>
          <button type="button" onClick={() => director.startAttract()}>Start Attract Mode now</button>
          <button type="button" onClick={() => director.stopAttract()}>Stop Attract Mode</button>
        </div>
        <div className="sim-row">
          <label>
            Min interval ms
            <input
              type="number"
              min={1000}
              step={500}
              value={attractModeConfig.minimumAttackDelayMs}
              onChange={(event) => {
                attractModeConfig.minimumAttackDelayMs = Math.max(1000, Number(event.target.value) || 4000)
                director.syncAttract()
              }}
            />
          </label>
          <label>
            Max interval ms
            <input
              type="number"
              min={1000}
              step={500}
              value={attractModeConfig.maximumAttackDelayMs}
              onChange={(event) => {
                attractModeConfig.maximumAttackDelayMs = Math.max(attractModeConfig.minimumAttackDelayMs, Number(event.target.value) || 8000)
                director.syncAttract()
              }}
            />
          </label>
        </div>
        <div className="sim-row">
          <label>
            Visual intensity {attractModeConfig.visualIntensity.toFixed(2)}
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={attractModeConfig.visualIntensity}
              onChange={(event) => {
                attractModeConfig.visualIntensity = Number(event.target.value)
                director.syncAttract()
              }}
            />
          </label>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { attractModeConfig.damageEnabled = !attractModeConfig.damageEnabled; director.syncAttract() }}>
            NPC damage {attractModeConfig.damageEnabled ? 'on' : 'off'}
          </button>
          <label>
            Damage
            <input
              type="number"
              min={0}
              step={0.05}
              value={attractModeConfig.damagePerAttack}
              onChange={(event) => {
                attractModeConfig.damagePerAttack = Math.max(0, Number(event.target.value) || 0)
                director.syncAttract()
              }}
            />
          </label>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) director.previewNpc('maple') }}>Test Canada dummy attack</button>
          <button type="button" onClick={() => { if (!locked) director.previewNpc('star') }}>Test USA dummy attack</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) director.simulateRealJoin('red') }}>Simulate viewer joining Canada</button>
          <button type="button" onClick={() => { if (!locked) director.simulateRealJoin('blue') }}>Simulate viewer joining USA</button>
          <button type="button" onClick={() => { if (!locked) director.simulateRealLeave() }}>Simulate viewer leaving</button>
        </div>
      </section>

      <section>
        <h3>Match tests</h3>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) joinWithCommand('C') }}>Join Canada (C)</button>
          <button type="button" onClick={() => { if (!locked) joinWithCommand('U') }}>Join USA (U)</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) sendLike() }}>Send like</button>
          <button type="button" onClick={() => { if (!locked) sendFollow() }}>Send follow</button>
          <button type="button" onClick={() => { if (!locked) sendShare() }}>Send share</button>
        </div>
        <div className="quick">
          {tiktokGifts.map((gift) => (
            <button key={gift.id} type="button" onClick={() => { if (!locked) sendGift(gift.id, 1) }}>
              {gift.displayName}
            </button>
          ))}
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) eliminateSubject() }}>Eliminate player</button>
          <button type="button" onClick={() => { if (!locked) rejoinEliminated() }}>Rejoin eliminated</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => director.reset()}>Restart battle</button>
        </div>
      </section>

      <section>
        <h3>Attack testing</h3>
        <div className="sim-row">
          <button type="button" onClick={() => setAttackTeam('red')}>Canada</button>
          <button type="button" onClick={() => setAttackTeam('blue')}>USA</button>
          <span>{attackTeam === 'red' ? 'Canada' : 'USA'}</span>
        </div>
        <div className="quick">
          {attackStyles.map((style) => (
            <button key={style} type="button" onClick={() => { if (!locked) director.previewAttack(style, attackTeam, attackDamage) }}>
              {ATTACK_LABELS[style]}
            </button>
          ))}
        </div>
        <label className="sim-slider">
          Damage {attackDamage}
          <input type="range" min={1} max={400} value={attackDamage} onChange={(event) => setAttackDamage(Number(event.target.value))} />
        </label>
        <label className="sim-slider">
          Animation speed {attackSpeed.toFixed(2)}
          <input type="range" min={0.4} max={2} step={0.05} value={attackSpeed} onChange={(event) => { const value = Number(event.target.value); setAttackSpeed(value); attackLab.speed = value }} />
        </label>
        <label className="sim-slider">
          Particle density {attackDensity.toFixed(2)}
          <input type="range" min={0.2} max={1.6} step={0.05} value={attackDensity} onChange={(event) => { const value = Number(event.target.value); setAttackDensity(value); attackLab.density = value }} />
        </label>
        <label className="sim-slider">
          Sound volume {Math.round(attackVolume * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={attackVolume} onChange={(event) => { const value = Number(event.target.value); setAttackVolume(value); attackLab.volume = value }} />
        </label>
        <label className="sim-slider">
          Camera shake {attackShake.toFixed(2)}
          <input type="range" min={0} max={1.5} step={0.05} value={attackShake} onChange={(event) => { const value = Number(event.target.value); setAttackShake(value); attackLab.shake = value }} />
        </label>
        {attackStyles.map((style) => (
          <label key={style} className="sim-slider">
            {ATTACK_LABELS[style]} volume {Math.round(attackLab.volumes[style] * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              defaultValue={attackLab.volumes[style]}
              onChange={(event) => { attackLab.volumes[style] = Number(event.target.value) }}
            />
          </label>
        ))}
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) { for (let i = 0; i < 24; i += 1) director.previewAttack('pulse', attackTeam, 4) } }}>Simulate repeated likes</button>
          <button type="button" onClick={() => { if (!locked) { director.previewAttack('rose', attackTeam, attackDamage); director.previewAttack('maple', attackTeam, attackDamage); director.previewAttack('star', attackTeam, attackDamage); director.previewAttack('vortex', attackTeam, attackDamage) } }}>Simulate several gifts</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { const next: AttackQuality = attackQuality === 'low' ? 'full' : 'low'; setAttackQuality(next); attackLab.quality = next }}>
            {attackQuality === 'low' ? 'Low-quality mobile mode on' : 'Low-quality mobile mode'}
          </button>
        </div>
      </section>

      <section>
        <h3>Battle</h3>
        <div className="sim-row">
          <button type="button" onClick={() => director.start()}>Start</button>
          <button type="button" onClick={() => director.pause()}>Pause</button>
          <button type="button" onClick={() => director.reset()}>Reset</button>
          <button type="button" onClick={() => director.previewCountdown()}>Test countdown</button>
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
          <button type="button" onClick={() => director.endRound('blue')}>END RED</button>
          <button type="button" onClick={() => director.endRound('red')}>END BLUE</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => director.resetRound()}>RESET ROUND</button>
          <button type="button" onClick={() => director.skipVictory()}>NEXT ROUND</button>
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
          <button type="button" onClick={() => { if (!locked) join('red') }}>Add red</button>
          <button type="button" onClick={() => { if (!locked) join('blue') }}>Add blue</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) director.addRandom(20) }}>Add 20</button>
          <button type="button" onClick={() => { if (!locked) director.addRandom(100) }}>Add 100</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) director.addRandom(10) }}>Add 10 test players</button>
          <button type="button" onClick={() => { if (!locked) director.addRandom(25) }}>Add 25 test players</button>
          <button type="button" onClick={() => { if (!locked) director.addRandom(50) }}>Add 50 test players</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) director.players.previewMotion('wander') }}>Test free movement</button>
          <button type="button" onClick={() => { if (!locked) director.addRandom(25, 'red') }}>Test crowded-team separation</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) director.players.previewMotion('lunge') }}>Test attack lunge</button>
          <button type="button" onClick={() => { if (!locked) director.players.previewMotion('recoil') }}>Test recoil</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) director.players.previewMotion('hit') }}>Test hit reaction</button>
          <button type="button" onClick={() => { if (!locked) director.players.previewMotion('celebrate') }}>Test celebration</button>
        </div>
        <div className="sim-row">
          <button type="button" className={motionDebug.bounds ? 'on' : ''} onClick={() => { motionDebug.bounds = !motionDebug.bounds }}>Show movement boundaries</button>
          <button type="button" className={motionDebug.collisions ? 'on' : ''} onClick={() => { motionDebug.collisions = !motionDebug.collisions }}>Show collision circles</button>
        </div>
        <div className="sim-row">
          <button type="button" className={motionDebug.forceReduced ? 'on' : ''} onClick={() => { motionDebug.forceReduced = !motionDebug.forceReduced }}>Toggle reduced motion</button>
        </div>
      </section>

      <section>
        <h3>Social</h3>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) burst(team, 100) }}>100 likes</button>
          <button type="button" onClick={() => { if (!locked) burst(team, 500) }}>500 likes</button>
          <button type="button" onClick={() => { if (!locked) burst(team, 1000) }}>1,000 likes</button>
        </div>
        <div className="sim-row">
          <button type="button" onClick={() => { if (!locked) social('follow', team) }}>Follow</button>
          <button type="button" onClick={() => { if (!locked) social('share', team) }}>Share</button>
          <button type="button" onClick={() => { if (!locked) comment(team) }}>Comment</button>
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
            {roster.filter((player) => !player.isNpc).map((player) => (
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
              if (locked) return
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

      <BackgroundMusicLab />
      <AudioLab />
    </aside>
  )
}

function BackgroundMusicLab() {
  const music = director.sound.background
  const [volume, setVolume] = useState(music.userVolume)
  const [status, setStatus] = useState<MusicStatus>(music.status())

  useEffect(() => {
    const pull = () => setStatus(music.status())
    pull()
    const timer = window.setInterval(pull, 400)
    return () => window.clearInterval(timer)
  }, [music])

  const refresh = () => setStatus(music.status())

  return (
    <section>
      <h3>Background music</h3>
      <p>Place a licensed file at public/audio/background-track.mp3. 25% is the default mix. Battle scenes move around that setting. Playback rate stays at 1× unless the switch below is on.</p>
      <p className="music-meta">
        <span>
          File <b>{status.filename}</b>
        </span>
        <span>
          State <b>{status.loading ? 'loading' : status.state}</b>
        </span>
        <span>
          Time <b>{formatAudioTime(status.currentTime)}</b>
        </span>
        <span>
          Duration <b>{formatAudioTime(status.duration)}</b>
        </span>
        <span>
          Volume <b>{Math.round(status.volume * 100)}%</b>
        </span>
        <span>
          Permission <b>{status.unlocked ? 'unlocked' : 'locked'}</b>
        </span>
      </p>
      {status.fallback && <p>Configured file is missing. Playing the royalty-free replacement.</p>}
      {status.missing && <p>No music file yet. The battle keeps running.</p>}
      {status.duplicateBattle && <p className="music-warning">More than one battle tab is sending audio.</p>}
      <label>
        Select audio file
        <input
          type="file"
          accept="audio/*"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            director.sound.unlock()
            void music.loadFile(file).then(refresh)
          }}
        />
      </label>
      <div className="sim-row">
        <button
          type="button"
          onClick={() => {
            director.sound.unlock()
            music.armExplicit()
            void music.play().then(refresh)
          }}
        >
          Play
        </button>
        <button type="button" onClick={() => { music.pause(); refresh() }}>
          Pause
        </button>
        <button
          type="button"
          onClick={() => {
            director.sound.unlock()
            music.restart()
            refresh()
          }}
        >
          Restart
        </button>
        <button
          type="button"
          onClick={() => {
            music.setMuted(!status.muted)
            refresh()
          }}
        >
          {status.muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" onClick={() => void music.reloadConfigured().then(refresh)}>
          Load configured file
        </button>
      </div>
      <label>
        Volume {Math.round(volume * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => {
            const value = Number(event.target.value)
            setVolume(value)
            music.setVolume(value)
            refresh()
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={status.enabled}
          onChange={(event) => {
            music.setEnabled(event.target.checked)
            refresh()
          }}
        />
        Music enabled
      </label>
      <label>
        <input
          type="checkbox"
          checked={status.loop}
          onChange={(event) => {
            music.setLoop(event.target.checked)
            refresh()
          }}
        />
        Seamless loop
      </label>
      <label>
        <input
          type="checkbox"
          checked={status.allowRate}
          onChange={(event) => {
            music.setAllowRate(event.target.checked)
            refresh()
          }}
        />
        Allow playback-rate changes
      </label>
      <label>
        Playback rate {status.playbackRate.toFixed(2)}×
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={status.playbackRate}
          disabled={!status.allowRate}
          onChange={(event) => {
            music.setPlaybackRate(Number(event.target.value))
            refresh()
          }}
        />
      </label>
      <div className="sim-row">
        <button type="button" onClick={() => director.sound.testBackground('battle')}>
          Test normal battle volume
        </button>
        <button type="button" onClick={() => director.sound.testBackground('final30')}>
          Test final 30 seconds
        </button>
        <button type="button" onClick={() => director.sound.testBackground('final10')}>
          Test final 10 seconds
        </button>
        <button type="button" onClick={() => director.sound.testBackground('victory')}>
          Test victory ducking
        </button>
        <button type="button" onClick={() => director.sound.testBackground('legendary')}>
          Test legendary attack ducking
        </button>
      </div>
    </section>
  )
}

const AUDIO_TESTS: { label: string; sfx: SfxName }[] = [
  { label: 'Test Small Gift', sfx: 'gift-small' },
  { label: 'Test Medium Gift', sfx: 'gift-medium' },
  { label: 'Test Large Gift', sfx: 'gift-large' },
  { label: 'Test Projectile', sfx: 'projectile' },
  { label: 'Test Laser', sfx: 'laser' },
  { label: 'Test Missile Launch', sfx: 'missile-launch' },
  { label: 'Test Missile Impact', sfx: 'missile-impact' },
  { label: 'Test Small Explosion', sfx: 'explosion-small' },
  { label: 'Test Large Explosion', sfx: 'explosion-large' },
  { label: 'Test Lightning', sfx: 'lightning' },
  { label: 'Test Fire', sfx: 'fire' },
  { label: 'Test Tornado', sfx: 'tornado' },
  { label: 'Test Meteor Fall', sfx: 'meteor-fall' },
  { label: 'Test Meteor Impact', sfx: 'meteor-impact' },
  { label: 'Test Ultimate Charge', sfx: 'ultimate-charge' },
  { label: 'Test Ultimate Impact', sfx: 'ultimate-impact' },
  { label: 'Test Combo', sfx: 'combo' },
  { label: 'Test High Combo', sfx: 'combo-high' },
  { label: 'Test Momentum', sfx: 'momentum' },
  { label: 'Test Team Lead', sfx: 'team-lead' },
  { label: 'Test Countdown', sfx: 'countdown-tick' },
  { label: 'Test Final Rush Start', sfx: 'final-rush-start' },
  { label: 'Test Victory SFX', sfx: 'victory' },
]

function AudioLab() {
  const sound = director.sound
  const [master, setMaster] = useState(sound.masterVolume)
  const [music, setMusic] = useState(sound.musicVolume)
  const [sfx, setSfx] = useState(sound.sfxVolume)
  const hud = useDirector()

  return (
    <section>
      <h3>Audio testing</h3>
      <label>
        Master {Math.round(master * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={master}
          onChange={(event) => {
            const value = Number(event.target.value)
            setMaster(value)
            sound.setMasterVolume(value)
          }}
        />
      </label>
      <label>
        Music {Math.round(music * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={music}
          onChange={(event) => {
            const value = Number(event.target.value)
            setMusic(value)
            sound.setMusicVolume(value)
          }}
        />
      </label>
      <label>
        SFX {Math.round(sfx * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={sfx}
          onChange={(event) => {
            const value = Number(event.target.value)
            setSfx(value)
            sound.setSfxVolume(value)
          }}
        />
      </label>
      <div className="sim-row">
        <button type="button" onClick={() => director.toggleMute()}>
          {hud.muted ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          onClick={() => {
            sound.unlock()
            sound.playBattleMusic(true)
          }}
        >
          Test Battle Music
        </button>
        <button
          type="button"
          onClick={() => {
            sound.unlock()
            sound.playFinalRushMusic(true)
          }}
        >
          Test Final Rush
        </button>
        <button
          type="button"
          onClick={() => {
            sound.unlock()
            sound.playVictoryMusic()
            sound.play('victory')
          }}
        >
          Test Victory Music
        </button>
        <button type="button" onClick={() => sound.previewClose()}>
          Test Close Battle
        </button>
        <button type="button" onClick={() => sound.previewComeback()}>
          Test Comeback
        </button>
        <button type="button" onClick={() => sound.previewLeadHit()}>
          Test Lead Change
        </button>
        <button type="button" onClick={() => sound.previewFinal('ten')}>
          Test Final 10
        </button>
        <button type="button" onClick={() => sound.previewFinal('three')}>
          Test Final 3
        </button>
      </div>
      <div className="audio-tests">
        {AUDIO_TESTS.map((item) => (
          <button key={item.sfx} type="button" onClick={() => sound.previewSfx(item.sfx)}>
            {item.label}
          </button>
        ))}
        <button type="button" onClick={() => sound.previewSfx('countdown-final')}>
          Test Countdown Final
        </button>
        <button type="button" onClick={() => sound.stopAll()}>
          Stop All Audio
        </button>
      </div>
      {sound.lastError ? <p className="sim-lock">{sound.lastError}</p> : null}
    </section>
  )
}

function unusedName(): string {
  const taken = new Set([...director.players.players.values()].map((player) => player.username.trim().toLowerCase()))
  for (let i = 0; i < 48; i += 1) {
    const name = takeName()
    if (!taken.has(name.trim().toLowerCase())) return name
  }
  return `guest${simSeq}`
}

function joinWithCommand(text: string, again?: { id: string; username: string; avatarUrl: string }): void {
  const team = teamCommand(text)
  if (!team) return
  const username = again?.username ?? unusedName()
  const id = again?.id ?? `sim-${simSeq++}`
  const avatarUrl = again?.avatarUrl ?? ''
  lastSubject = { id, username, avatarUrl, team }
  mockTikTok.emit({
    type: 'viewerJoined',
    payload: { userId: id, username, avatarUrl, team, explicit: true },
  })
  const live = director.players.players.get(id)
  if (live) lastSubject = { id: live.id, username: live.username, avatarUrl: live.avatarUrl, team: live.team }
}

function testSubject(team: TeamId): { id: string; username: string; avatarUrl: string; team: TeamId } {
  if (lastSubject && director.players.players.has(lastSubject.id)) {
    const live = director.players.players.get(lastSubject.id)!
    return { id: live.id, username: live.username, avatarUrl: live.avatarUrl, team: live.team }
  }
  const found = [...director.players.players.values()].find((player) => player.team === team)
  if (found) return { id: found.id, username: found.username, avatarUrl: found.avatarUrl, team: found.team }
  joinWithCommand(team === 'red' ? 'C' : 'U')
  return lastSubject!
}

function sendLike(): void {
  const player = testSubject('red')
  mockTikTok.emit({
    type: 'likeReceived',
    payload: { userId: player.id, username: player.username, avatarUrl: player.avatarUrl, team: player.team, count: 1 },
  })
}

function sendFollow(): void {
  const player = testSubject('red')
  mockTikTok.emit({
    type: 'followReceived',
    payload: { userId: player.id, username: player.username, avatarUrl: player.avatarUrl, team: player.team },
  })
}

function sendShare(): void {
  const player = testSubject('blue')
  mockTikTok.emit({
    type: 'shareReceived',
    payload: { userId: player.id, username: player.username, avatarUrl: player.avatarUrl, team: player.team },
  })
}

function sendGift(id: string, count: number): void {
  const gift = tiktokGifts.find((item) => item.id === id)
  const player = testSubject('red')
  mockTikTok.emit({
    type: 'giftReceived',
    payload: {
      userId: player.id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      team: player.team,
      giftId: id,
      giftName: gift?.name ?? id,
      giftCount: count,
      coinValue: gift?.coinValue,
      repeatEnd: true,
      image: gift?.image,
    },
  })
}

function eliminateSubject(): void {
  const tracked = lastSubject ? director.players.players.get(lastSubject.id) : undefined
  const player = tracked ?? [...director.players.players.values()].find((item) => !/^p\d+$/.test(item.id))
  if (!player) return
  const body = director.players.bodies.get(player.id)
  if (!body || body.dying > 0 || body.hp <= 0) return
  eliminated = { id: player.id, username: player.username, avatarUrl: player.avatarUrl, team: player.team }
  director.players.strike(player.id, body.maxHp)
}

function rejoinEliminated(): void {
  if (!eliminated || director.players.players.has(eliminated.id)) return
  const text = eliminated.team === 'red' ? 'C' : 'U'
  const person = eliminated
  eliminated = null
  joinWithCommand(text, person)
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

function comment(team: TeamId): void {
  const mates = [...director.players.players.values()].filter((player) => player.team === team)
  const attacker = mates[Math.floor(Math.random() * mates.length)]
  mockTikTok.emit({
    type: 'commentReceived',
    payload: {
      userId: attacker?.id ?? `sim-${simSeq++}`,
      username: attacker?.username ?? takeName(),
      avatarUrl: attacker?.avatarUrl ?? '',
      text: 'lets go',
    },
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
  roster: { id: string; username: string; avatarUrl: string; team: TeamId; isNpc?: boolean }[],
): { id: string; username: string; avatarUrl: string; team: TeamId } {
  const people = roster.filter((player) => !player.isNpc)
  if (sender !== 'random' && sender !== 'new') {
    const found = people.find((player) => player.id === sender)
    if (found) return found
  }
  if (sender === 'random') {
    const mates = people.filter((player) => player.team === team)
    const pool = mates.length > 0 ? mates : people
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
