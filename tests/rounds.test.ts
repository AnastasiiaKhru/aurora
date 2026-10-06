import assert from 'node:assert/strict'
import test from 'node:test'
import { battleConfig } from '../src/config/battleConfig.ts'
import { BattleSystem, teamHealthPercent } from '../src/systems/BattleSystem.ts'
import { COUNT_BEAT_MS, NEW_BATTLE_MS, NEXT_ROUND_MS, nextRoundCue } from '../src/systems/roundCue.ts'
import { rankVictory } from '../src/systems/victoryRank.ts'
import type { LeaderboardEntry } from '../src/types/Player.ts'

test('shown HP is 0 only when that team has no real HP left', () => {
  const max = battleConfig.maxHealth
  assert.equal(teamHealthPercent(max, max), 100)
  assert.equal(teamHealthPercent(max - 1, max), 99)
  assert.equal(teamHealthPercent(max * 0.01, max), 1)
  assert.equal(teamHealthPercent(max * 0.004, max), 1)
  assert.equal(teamHealthPercent(1, max), 1)
  assert.equal(teamHealthPercent(0, max), 0)
  assert.equal(teamHealthPercent(-4, max), 0)
})

test('next round cue is NEW BATTLE, 3, 2, 1, FIGHT', () => {
  assert.equal(nextRoundCue(0)?.label, 'NEXT')
  assert.equal(nextRoundCue(NEW_BATTLE_MS - 1)?.label, 'NEXT')
  assert.equal(nextRoundCue(NEW_BATTLE_MS)?.label, '3')
  assert.equal(nextRoundCue(NEW_BATTLE_MS + COUNT_BEAT_MS)?.label, '2')
  assert.equal(nextRoundCue(NEW_BATTLE_MS + COUNT_BEAT_MS * 2)?.label, '1')
  assert.equal(nextRoundCue(NEW_BATTLE_MS + COUNT_BEAT_MS * 3)?.label, 'FIGHT')
  assert.equal(nextRoundCue(NEXT_ROUND_MS - 1)?.label, 'FIGHT')
  assert.equal(nextRoundCue(NEXT_ROUND_MS), null)
  assert.equal(nextRoundCue(Number.NaN)?.label, 'NEXT')
})

test('victory celebration holds long enough to read and ranks only real viewers', () => {
  assert.ok(battleConfig.victoryHoldMs >= 10_000 && battleConfig.victoryHoldMs <= 12_000)
  const viewer = (id: string, team: 'red' | 'blue', points: number): LeaderboardEntry => ({
    id,
    username: id,
    avatarUrl: '',
    initials: 'AA',
    team,
    giftValue: points,
    battlePoints: points,
    damageDealt: points,
    giftCount: 1,
    largestCombo: 1,
  })
  const giftedFiller = viewer('p9', 'blue', 10000)
  giftedFiller.participated = true
  const ranked = rankVictory(
    [
      viewer('p3', 'red', 9000),
      giftedFiller,
      viewer('ace', 'red', 4200),
      viewer('npc-canada', 'red', 8000),
      viewer('bee', 'blue', 3000),
      viewer('cy', 'red', 1800),
      viewer('dee', 'red', 900),
      viewer('zero', 'red', 0),
    ],
    'red',
  )
  assert.deepEqual(ranked.map((entry) => entry.id), ['p9', 'ace', 'bee'])
  assert.equal(rankVictory([viewer('solo', 'blue', 50)], 'blue').length, 1)
  assert.equal(rankVictory([viewer('p1', 'blue', 50)], 'blue').length, 0)
})

test('three wiped battles each lock once and restore both teams', () => {
  const battle = new BattleSystem()
  const losers = ['blue', 'red', 'blue'] as const
  for (const [index, loser] of losers.entries()) {
    battle.beginCountdown()
    battle.status = 'running'
    battle.red.score = 10 + index
    battle.blue.score = 4
    battle.team(loser).health = 0
    const winner = battle.wipeWinner()
    assert.equal(winner, loser === 'blue' ? 'red' : 'blue', `round ${index + 1} winner`)
    assert.equal(battle.lockVictory(winner ?? 'draw', [], []), true)
    assert.equal(battle.lockVictory('draw', [], []), false)
    assert.equal(battle.wipeWinner(), null)
    assert.equal(battle.status, 'victory')
    assert.equal(battle.tick(0.016).roundOver, false)
    battle.victoryEndsAt = Date.now() - 5
    assert.equal(battle.tick(0.016).roundOver, true)
    battle.markResetting()
    battle.beginCountdown()
    assert.equal(battle.status, 'countdown')
    assert.equal(battle.victory, null)
    assert.equal(battle.red.health, battleConfig.maxHealth)
    assert.equal(battle.blue.health, battleConfig.maxHealth)
    assert.equal(battle.red.score, 0)
    assert.equal(battle.blue.score, 0)
    assert.equal(battle.wipeWinner(), null)
  }
})

test('three live rounds celebrate, count in, and start clean', async () => {
  const frames: FrameRequestCallback[] = []
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  }) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    },
  })

  const { director } = await import('../src/systems/GameDirector.ts')
  const engine = director as unknown as {
    tick: (dt: number, now: number) => void
    roundStartedAt: number
    combatRound: number
    attacks: { pending: number }
  }
  const step = () => engine.tick(0.016, performance.now())
  const dummies = (team: 'red' | 'blue') =>
    [...director.players.players.values()].filter((player) => player.team === team && /^p\d+$/.test(player.id)).length

  step()
  engine.roundStartedAt = Date.now() - (5_000 + 720 + 50)
  step()
  assert.equal(director.battle.status, 'running')
  assert.equal(dummies('red'), battleConfig.rosterRed)
  assert.equal(dummies('blue'), battleConfig.rosterBlue)
  const combatAtStart = engine.combatRound

  const finish = (winner: 'red' | 'blue') => {
    const combatBefore = engine.combatRound
    const playersBefore = director.players.players.size
    director.endRound(winner)
    assert.equal(director.battle.status, 'victory')
    assert.equal(director.getSnapshot().victory?.result, winner)
    assert.equal(engine.attacks.pending, 0)
    director.endRound(winner === 'red' ? 'blue' : 'red')
    assert.equal(director.getSnapshot().victory?.result, winner)
    assert.equal(engine.combatRound, combatBefore + 1)
    director.battle.victoryEndsAt = Date.now() - 1
    step()
    assert.equal(director.battle.status, 'countdown')
    assert.equal(director.getSnapshot().victory, null)
    assert.equal(director.getSnapshot().countdown?.label, 'NEXT')
    assert.equal(director.battle.red.health, battleConfig.maxHealth)
    assert.equal(director.battle.blue.health, battleConfig.maxHealth)
    director.battle.red.health = 0
    director.battle.blue.health = 0
    step()
    assert.equal(director.battle.status, 'countdown')
    assert.equal(director.getSnapshot().victory, null)
    engine.roundStartedAt = Date.now() - (NEW_BATTLE_MS + 10)
    step()
    assert.equal(director.getSnapshot().countdown?.label, '3')
    engine.roundStartedAt = Date.now() - (NEW_BATTLE_MS + COUNT_BEAT_MS + 10)
    step()
    assert.equal(director.getSnapshot().countdown?.label, '2')
    engine.roundStartedAt = Date.now() - (NEW_BATTLE_MS + COUNT_BEAT_MS * 2 + 10)
    step()
    assert.equal(director.getSnapshot().countdown?.label, '1')
    engine.roundStartedAt = Date.now() - (NEW_BATTLE_MS + COUNT_BEAT_MS * 3 + 10)
    step()
    assert.equal(director.getSnapshot().countdown?.label, 'FIGHT')
    assert.equal(director.battle.status, 'countdown')
    assert.equal(engine.attacks.pending, 0)
    engine.roundStartedAt = Date.now() - (NEXT_ROUND_MS + 30)
    step()
    assert.equal(director.battle.status, 'running')
    assert.equal(director.getSnapshot().countdown, null)
    assert.equal(director.getSnapshot().victory, null)
    assert.equal(director.battle.red.health, battleConfig.maxHealth)
    assert.equal(director.battle.blue.health, battleConfig.maxHealth)
    assert.equal(director.battle.red.score, 0)
    assert.equal(director.battle.blue.score, 0)
    assert.equal(dummies('red'), battleConfig.rosterRed)
    assert.equal(dummies('blue'), battleConfig.rosterBlue)
    assert.equal(director.players.players.size, playersBefore)
    assert.ok(engine.attacks.pending <= 2)
    for (const command of director.attacks.queue) assert.equal(command.roundToken, engine.combatRound)
  }

  finish('red')
  finish('blue')
  finish('red')
  assert.equal(director.getSnapshot().round, 4)
  assert.equal(engine.combatRound, combatAtStart + 3)
  assert.equal(frames.length > 0, true)

  const like = (team: 'red' | 'blue', damage: number) =>
    director.onImpact(
      {
        id: 0,
        attackType: 'energy_bullet',
        team,
        fromX: 0.2,
        fromY: 0.5,
        toX: 0.8,
        toY: 0.5,
        intensity: 0.6,
        duration: 0.7,
        damage,
        shake: 'none',
        particleIntensity: 0.2,
        sound: 'projectile',
        priority: 2,
        username: 'ace',
        giftName: 'Like',
        combo: 1,
        rarity: 'micro',
        impacts: [0.74],
        roundToken: engine.combatRound,
      },
      0.8,
      0.5,
      0,
    )

  director.battle.victory = { result: 'draw', redScore: 1, blueScore: 1, mvp: null, top: [], portraits: [] }
  director.battle.blue.health = battleConfig.maxHealth * 0.01
  assert.equal(teamHealthPercent(director.battle.blue.health, battleConfig.maxHealth), 1)
  like('red', director.battle.blue.health)
  assert.equal(director.battle.blue.health, 0)
  assert.equal(teamHealthPercent(director.battle.blue.health, battleConfig.maxHealth), 0)
  assert.equal(director.battle.status, 'victory')
  assert.equal(director.getSnapshot().victory?.result, 'red')
  assert.equal(director.getSnapshot().red.health, battleConfig.maxHealth)
  director.battle.victoryEndsAt = Date.now() - 1
  step()
  assert.equal(director.battle.status, 'countdown')
  assert.equal(director.battle.red.health, battleConfig.maxHealth)
  assert.equal(director.battle.blue.health, battleConfig.maxHealth)
  engine.roundStartedAt = Date.now() - (NEXT_ROUND_MS + 30)
  step()
  assert.equal(director.battle.status, 'running')
  assert.equal(director.getSnapshot().victory, null)

  director.battle.red.health = battleConfig.likeShotDamage
  assert.equal(teamHealthPercent(director.battle.red.health, battleConfig.maxHealth), 1)
  like('blue', battleConfig.likeShotDamage)
  assert.equal(director.battle.red.health, 0)
  assert.equal(director.getSnapshot().victory?.result, 'blue')
  director.battle.victoryEndsAt = Date.now() - 1
  step()
  engine.roundStartedAt = Date.now() - (NEXT_ROUND_MS + 30)
  step()
  assert.equal(director.battle.status, 'running')
  assert.equal(director.battle.red.health, battleConfig.maxHealth)
  assert.equal(director.battle.blue.health, battleConfig.maxHealth)

  director.battle.blue.health = battleConfig.likeShotDamage * 4
  assert.equal(teamHealthPercent(director.battle.blue.health, battleConfig.maxHealth), 1)
  for (let hit = 0; hit < 10; hit += 1) like('red', battleConfig.likeShotDamage)
  assert.equal(director.battle.status, 'victory')
  assert.equal(director.getSnapshot().victory?.result, 'red')
  assert.equal(director.battle.blue.health, 0)
  director.endRound('blue')
  assert.equal(director.getSnapshot().victory?.result, 'red')
  director.battle.victoryEndsAt = Date.now() - 1
  step()
  engine.roundStartedAt = Date.now() - (NEXT_ROUND_MS + 30)
  step()
  assert.equal(director.battle.status, 'running')
  const before = director.battle.blue.health
  like('red', battleConfig.likeShotDamage)
  assert.equal(director.battle.status, 'running')
  assert.equal(director.battle.blue.health, before - battleConfig.likeShotDamage)
  assert.equal(director.getSnapshot().victory, null)
})

test('one team win shows the top three and then restarts', async () => {
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    },
  })

  const { director } = await import('../src/systems/GameDirector.ts')
  const engine = director as unknown as {
    tick: (dt: number, now: number) => void
    roundStartedAt: number
  }
  const step = () => engine.tick(0.016, performance.now())
  step()
  engine.roundStartedAt = Date.now() - (5_000 + 720 + 50)
  step()
  assert.equal(director.battle.status, 'running')

  const fan = (id: string, team: 'red' | 'blue', points: number) => {
    const player = director.players.add({
      id,
      username: id,
      team,
      avatarUrl: '',
      avatarKey: '',
      initials: id.slice(0, 2).toUpperCase(),
    })
    player.battlePoints = points
    player.giftValue = points
    player.participated = true
    return player
  }
  fan('ace', 'red', 900)
  fan('bee', 'blue', 400)
  fan('cy', 'red', 200)
  fan('dee', 'blue', 50)

  director.endRound('red')
  const shown = director.getSnapshot().victory
  assert.equal(director.battle.status, 'victory')
  assert.equal(shown?.result, 'red')
  assert.deepEqual(shown?.top.map((entry) => entry.username), ['ace', 'bee', 'cy'])
  assert.equal(shown?.mvp?.username, 'ace')

  step()
  assert.equal(director.battle.status, 'victory')
  assert.deepEqual(
    director.getSnapshot().victory?.top.map((entry) => entry.username),
    ['ace', 'bee', 'cy'],
  )

  director.battle.victoryEndsAt = Date.now() - 1
  step()
  assert.equal(director.battle.status, 'countdown')
  assert.equal(director.getSnapshot().victory, null)
  assert.equal(director.getSnapshot().countdown?.label, 'NEXT')

  engine.roundStartedAt = Date.now() - (NEXT_ROUND_MS + 30)
  step()
  assert.equal(director.battle.status, 'running')
  assert.equal(director.getSnapshot().victory, null)
  assert.equal(director.getSnapshot().countdown, null)
  assert.equal(director.battle.red.health, battleConfig.maxHealth)
  assert.equal(director.battle.blue.health, battleConfig.maxHealth)
  assert.equal(director.battle.red.score, 0)
  assert.equal(director.battle.blue.score, 0)
})
