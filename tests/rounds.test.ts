import assert from 'node:assert/strict'
import test from 'node:test'
import { battleConfig } from '../src/config/battleConfig.ts'
import { BattleSystem } from '../src/systems/BattleSystem.ts'
import { COUNT_BEAT_MS, NEW_BATTLE_MS, NEXT_ROUND_MS, nextRoundCue } from '../src/systems/roundCue.ts'

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
})
