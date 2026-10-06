import assert from 'node:assert/strict'
import test from 'node:test'
import { BattleSystem } from '../src/systems/BattleSystem.ts'
import {
  AttractClock,
  allowedNpcDamage,
  applyNpcHealth,
  attractModeConfig,
  attractModePlayers,
  chooseNpcSide,
  nextNpcDelay,
  realTeamCounts,
} from '../src/systems/attractMode.ts'

test('retired guardian ids stay internal and are not shown as labeled fighters', () => {
  assert.equal(attractModePlayers.canada.id, 'npc-canada')
  assert.equal(attractModePlayers.usa.id, 'npc-usa')
  assert.equal(attractModePlayers.canada.isNpc, true)
  assert.equal(attractModePlayers.usa.isNpc, true)
  assert.equal(attractModeConfig.showNpcBadge, false)
})

test('npc attacks are irregular and not a perfect alternation', () => {
  const rolls = [0.1, 0.9, 0.2, 0.95]
  let cursor = 0
  const random = () => rolls[cursor++] ?? 0.5
  let last: 'red' | 'blue' | null = null
  const sides = []
  for (let i = 0; i < 4; i += 1) {
    last = chooseNpcSide(random, last)
    sides.push(last)
  }
  const switches = sides.slice(1).filter((side, index) => side !== sides[index]).length
  assert.ok(switches < sides.length - 1)
  cursor = 0
  const short = nextNpcDelay(() => 0.95, 'full')
  assert.ok(short >= 4_000 && short <= 8_000)
  const long = nextNpcDelay(() => 0.05, 'full')
  assert.ok(long >= 10_000 && long <= 12_000)
  const slower = nextNpcDelay(() => 0.95, 'reduced')
  assert.ok(slower > short)
})

test('npc damage stays tiny, cannot eliminate, and cannot decide a winner', () => {
  const battle = new BattleSystem()
  battle.status = 'running'
  const before = { health: battle.blue.health, score: battle.blue.score }
  const budget = { dealt: 0 }
  for (let hit = 0; hit < 80; hit += 1) applyNpcHealth(battle.blue, budget, attractModeConfig.damagePerAttack)
  assert.ok(budget.dealt <= attractModeConfig.maximumDamagePerRound + 0.001)
  assert.ok(battle.blue.health >= battle.blue.maxHealth * (attractModeConfig.minimumTeamHealth / 100) - 0.001)
  assert.equal(battle.blue.score, before.score)
  assert.equal(battle.wipeWinner(), null)
  assert.equal(battle.red.health, battle.red.maxHealth)
  const blocked = allowedNpcDamage(0.1, attractModeConfig.maximumDamagePerRound, battle.blue.health, battle.blue.maxHealth)
  assert.equal(blocked, 0)
  attractModeConfig.damageEnabled = false
  assert.equal(allowedNpcDamage(0.1, 0, battle.blue.health, battle.blue.maxHealth), 0)
  attractModeConfig.damageEnabled = true
  assert.ok(before.health - battle.blue.health <= attractModeConfig.maximumDamagePerRound + 0.001)
})

test('npcs pause for a full room and resume only after the idle wait', () => {
  const clock = new AttractClock()
  assert.equal(clock.step(0, { red: 2, blue: 2 }, () => 0.5), null)
  assert.equal(clock.mode, 'paused')
  assert.equal(clock.step(1_000, { red: 0, blue: 0 }, () => 0.5), null)
  assert.equal(clock.mode, 'waiting')
  assert.equal(clock.step(19_000, { red: 0, blue: 0 }, () => 0.5), null)
  clock.step(21_000, { red: 0, blue: 0 }, () => 0.5)
  assert.equal(clock.mode, 'full')
  const again = new AttractClock()
  again.step(0, { red: 1, blue: 0 }, () => 0.9)
  assert.equal(again.mode, 'reduced')
})

test('one clock does not fire twice for the same moment and a restart clears the budget', () => {
  const clock = new AttractClock()
  clock.step(0, { red: 0, blue: 0 }, () => 0.9)
  const due = clock.nextAt
  const first = clock.step(due, { red: 0, blue: 0 }, () => 0.9)
  const second = clock.step(due, { red: 0, blue: 0 }, () => 0.9)
  assert.ok(first === 'red' || first === 'blue')
  assert.equal(second, null)
  clock.damageDealt = 4
  clock.reset()
  assert.equal(clock.damageDealt, 0)
  assert.equal(clock.nextAt, 0)
  const counts = realTeamCounts(
    [
      { id: 'npc-canada', team: 'red', isNpc: true },
      { id: 'p3', team: 'red' },
      { id: 'viewer-1', team: 'blue' },
    ],
    () => true,
  )
  assert.deepEqual(counts, { red: 0, blue: 1 })
})
