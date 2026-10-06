import assert from 'node:assert/strict'
import test from 'node:test'
import { tiktokGifts } from '../src/config/tiktokGifts.ts'
import {
  AUTO_BATTLE_CONFIG,
  AUTO_BASIC_DAMAGE,
  AUTO_BIG_ATTACK_DAMAGE_MULTIPLIER,
  AutoBattleClock,
  BIG_AUTO_ATTACK_IDS,
  ambientAttackDamage,
  bigAutoAttackPool,
  isFieldDummy,
  pickBigAttack,
  type AutoAction,
  type AutoBattleQuery,
} from '../src/systems/autoBattle.ts'
import type { TeamId } from '../src/types/Team.ts'

const saved = {
  basicIntervalMs: AUTO_BATTLE_CONFIG.basicIntervalMs,
  teamOffsetMs: AUTO_BATTLE_CONFIG.teamOffsetMs,
  basicJitterMs: AUTO_BATTLE_CONFIG.basicJitterMs,
  bigAttackMinDelayMs: AUTO_BATTLE_CONFIG.bigAttackMinDelayMs,
  bigAttackMaxDelayMs: AUTO_BATTLE_CONFIG.bigAttackMaxDelayMs,
  basicDamage: AUTO_BATTLE_CONFIG.basicDamage,
  bigDamageMultiplier: AUTO_BATTLE_CONFIG.bigDamageMultiplier,
  bigDamageCap: AUTO_BATTLE_CONFIG.bigDamageCap,
  enabled: AUTO_BATTLE_CONFIG.enabled,
}

function restoreConfig(): void {
  Object.assign(AUTO_BATTLE_CONFIG, saved)
}

function query(red: string[], blue: string[], random: () => number, running = true, round = 1, busy = false): AutoBattleQuery {
  return {
    running,
    round,
    busy,
    alive: (team: TeamId) => (team === 'red' ? red : blue),
    random,
  }
}

function basics(actions: AutoAction[], team: TeamId): AutoAction[] {
  return actions.filter((action) => action.type === 'basic' && action.team === team)
}

test('field dummies are generated fighters, never real viewers or labeled guardians', () => {
  assert.equal(isFieldDummy({ id: 'p1' }), true)
  assert.equal(isFieldDummy({ id: 'p12' }), true)
  assert.equal(isFieldDummy({ id: 'viewer-sim-1' }), false)
  assert.equal(isFieldDummy({ id: 'fan-sarah' }), false)
  assert.equal(isFieldDummy({ id: '7123456789' }), false)
  assert.equal(isFieldDummy({ id: 'npc-canada', isNpc: true }), false)
  assert.equal(isFieldDummy({ id: 'p4', isNpc: true }), false)
})

test('big auto attacks use existing gifts and do not repeat the same visual', () => {
  const pool = bigAutoAttackPool()
  assert.equal(pool.length, BIG_AUTO_ATTACK_IDS.length)
  assert.equal(new Set(pool.map((item) => item.style)).size, pool.length)
  for (const id of BIG_AUTO_ATTACK_IDS) {
    assert.ok(tiktokGifts.some((gift) => gift.id === id))
  }
  let last: string | null = null
  for (let i = 0; i < 12; i += 1) {
    const pick = pickBigAttack(() => ((i * 17) % 10) / 10, last)
    assert.ok(pick)
    assert.notEqual(pick.id, last)
    last = pick.id
  }
})

test('ambient damage stays tiny and does not change real gift damage', () => {
  const galaxy = tiktokGifts.find((gift) => gift.id === 'galaxy')
  const rose = tiktokGifts.find((gift) => gift.id === 'rose')
  assert.ok(galaxy && rose)
  const beforeGalaxy = galaxy.baseDamage
  const beforeRose = rose.baseDamage
  const big = ambientAttackDamage(galaxy.baseDamage, 'big')
  assert.equal(ambientAttackDamage(rose.baseDamage, 'basic'), AUTO_BASIC_DAMAGE)
  assert.equal(AUTO_BATTLE_CONFIG.basicDamage, AUTO_BASIC_DAMAGE)
  assert.equal(AUTO_BATTLE_CONFIG.bigDamageMultiplier, AUTO_BIG_ATTACK_DAMAGE_MULTIPLIER)
  assert.ok(big <= AUTO_BATTLE_CONFIG.bigDamageCap)
  assert.ok(big < galaxy.baseDamage * 0.01)
  assert.equal(galaxy.baseDamage, beforeGalaxy)
  assert.equal(rose.baseDamage, beforeRose)
  const minutes = 3
  const basicsEach = (minutes * 60_000) / AUTO_BATTLE_CONFIG.basicIntervalMs
  const bigs = (minutes * 60_000) / AUTO_BATTLE_CONFIG.bigAttackMinDelayMs
  const ambientHp = basicsEach * 2 * AUTO_BASIC_DAMAGE + bigs * AUTO_BATTLE_CONFIG.bigDamageCap
  assert.ok(ambientHp < 40)
})

test('each team keeps one basic attacker and fires on a staggered 5 second rhythm', () => {
  const clock = new AutoBattleClock()
  const red = ['p1', 'p2']
  const blue = ['p8', 'p9']
  const canada: number[] = []
  const usa: number[] = []
  const seenCanada = new Set<string>()
  const seenUsa = new Set<string>()
  for (let t = 0; t <= 20_000; t += 100) {
    const actions = clock.step(t, query(red, blue, () => 0.5))
    for (const action of basics(actions, 'red')) {
      if (action.type !== 'basic') continue
      canada.push(t)
      seenCanada.add(action.actorId)
    }
    for (const action of basics(actions, 'blue')) {
      if (action.type !== 'basic') continue
      usa.push(t)
      seenUsa.add(action.actorId)
    }
  }
  assert.deepEqual([...seenCanada], [clock.canadaAutoAttacker])
  assert.deepEqual([...seenUsa], [clock.usaAutoAttacker])
  assert.equal(seenCanada.size, 1)
  assert.equal(seenUsa.size, 1)
  assert.notEqual(clock.canadaAutoAttacker, clock.usaAutoAttacker)
  assert.ok(red.includes(clock.canadaAutoAttacker ?? ''))
  assert.ok(blue.includes(clock.usaAutoAttacker ?? ''))
  assert.equal(usa[0]! - canada[0]!, AUTO_BATTLE_CONFIG.teamOffsetMs)
  for (let i = 1; i < canada.length; i += 1) {
    const gap = canada[i]! - canada[i - 1]!
    assert.ok(gap >= 4_600 && gap <= 5_400)
  }
  for (let i = 1; i < usa.length; i += 1) {
    const gap = usa[i]! - usa[i - 1]!
    assert.ok(gap >= 4_600 && gap <= 5_400)
  }
  assert.ok(canada.length >= 4)
  assert.ok(usa.length >= 4)
})

test('a dead auto attacker is replaced by another dummy and never by silence turning into a burst', () => {
  const clock = new AutoBattleClock()
  let red = ['p1', 'p2']
  clock.step(0, query(red, ['p8'], () => 0))
  assert.equal(clock.canadaAutoAttacker, 'p1')
  red = ['p2']
  const second = clock.step(4_600, query(red, ['p8'], () => 0))
  assert.equal(clock.canadaAutoAttacker, 'p2')
  assert.equal(basics(second, 'red').length, 1)
  const empty = clock.step(9_200, query([], ['p8'], () => 0))
  assert.equal(basics(empty, 'red').length, 0)
  assert.equal(clock.canadaAutoAttacker, null)
  const again = clock.step(9_200, query([], ['p8'], () => 0))
  assert.equal(basics(again, 'red').length, 0)
})

test('big attacks alternate teams, vary the attack, and never stack', () => {
  const clock = new AutoBattleClock()
  const charges: { t: number; team: TeamId; attackId: string; actorId: string }[] = []
  const launches: { t: number; team: TeamId }[] = []
  for (let t = 0; t <= 80_000; t += 50) {
    const actions = clock.step(t, query(['p1', 'p2', 'p3'], ['p8', 'p9'], () => 0.5))
    const charge = actions.find((action) => action.type === 'charge')
    const launch = actions.find((action) => action.type === 'launch')
    assert.ok(actions.filter((action) => action.type === 'charge' || action.type === 'launch').length <= 1)
    if (charge && charge.type === 'charge') charges.push({ t, team: charge.team, attackId: charge.attackId, actorId: charge.actorId })
    if (launch && launch.type === 'launch') launches.push({ t, team: launch.team })
  }
  assert.ok(charges.length >= 2)
  for (let i = 1; i < charges.length; i += 1) {
    assert.notEqual(charges[i]!.team, charges[i - 1]!.team)
    assert.notEqual(charges[i]!.attackId, charges[i - 1]!.attackId)
    assert.ok(charges[i]!.t - charges[i - 1]!.t >= AUTO_BATTLE_CONFIG.bigAttackMinDelayMs)
  }
  const actors = new Set(charges.map((item) => item.actorId))
  assert.equal(launches.length, charges.length)
  for (let i = 0; i < charges.length; i += 1) {
    const windup = launches[i]!.t - charges[i]!.t
    assert.ok(windup >= AUTO_BATTLE_CONFIG.bigChargeMs && windup < AUTO_BATTLE_CONFIG.bigChargeMs + 50)
  }
  assert.ok(actors.size >= 2)
})

test('a real viewer event delays a big attack that is about to start', () => {
  AUTO_BATTLE_CONFIG.bigAttackMinDelayMs = 1_000
  AUTO_BATTLE_CONFIG.bigAttackMaxDelayMs = 1_000
  AUTO_BATTLE_CONFIG.basicIntervalMs = 100_000
  try {
    const clock = new AutoBattleClock()
    const q = () => query(['p1'], ['p8'], () => 0.5)
    clock.step(0, q())
    clock.noteViewer(900, 'gift', 'legendary')
    assert.equal(clock.step(1_000, q()).some((action) => action.type === 'charge'), false)
    assert.equal(clock.step(4_000, q()).some((action) => action.type === 'charge'), false)
    assert.equal(clock.step(4_100, q()).some((action) => action.type === 'charge'), false)
    assert.equal(clock.step(5_200, q()).some((action) => action.type === 'charge'), true)
  } finally {
    restoreConfig()
  }
})

test('restarting the battle does not stack schedulers', () => {
  const clock = new AutoBattleClock()
  const count = (round: number) => {
    clock.step(0, query(['p1'], ['p8'], () => 0.5, false, round))
    let shots = 0
    for (let t = 0; t <= 15_000; t += 100) {
      const actions = clock.step(t, query(['p1'], ['p8'], () => 0.5, true, round))
      shots += basics(actions, 'red').length + basics(actions, 'blue').length
    }
    return shots
  }
  const first = count(1)
  const second = count(2)
  const third = count(3)
  assert.equal(first, second)
  assert.equal(second, third)
  assert.ok(first > 0)
  assert.ok(first < 12)
})

test('basic shots stay quiet while a big attack plays, then the rhythm continues', () => {
  const clock = new AutoBattleClock()
  const stamps: number[] = []
  let charged = false
  for (let t = 0; t <= 50_000; t += 50) {
    const actions = clock.step(t, query(['p1'], ['p8'], () => 0.5))
    if (actions.some((action) => action.type === 'charge')) charged = true
    if (actions.some((action) => action.type === 'charge' || action.type === 'launch')) {
      assert.equal(basics(actions, 'red').length + basics(actions, 'blue').length, 0)
    }
    for (const action of actions) {
      if (action.type === 'basic') stamps.push(t)
    }
  }
  assert.equal(charged, true)
  for (let i = 1; i < stamps.length; i += 1) assert.ok(stamps[i]! - stamps[i - 1]! >= 2_000)
})

test('production timing stays slow enough that viewers still decide the match', () => {
  assert.equal(AUTO_BATTLE_CONFIG.enabled, true)
  assert.equal(AUTO_BATTLE_CONFIG.debug, false)
  assert.equal(AUTO_BATTLE_CONFIG.basicIntervalMs, 5_000)
  assert.equal(AUTO_BATTLE_CONFIG.teamOffsetMs, 2_500)
  assert.equal(AUTO_BATTLE_CONFIG.bigAttackMinDelayMs, 20_000)
  assert.equal(AUTO_BATTLE_CONFIG.bigAttackMaxDelayMs, 45_000)
  assert.equal(AUTO_BATTLE_CONFIG.basicDamage, 0.1)
  assert.ok(AUTO_BATTLE_CONFIG.bigDamageMultiplier <= 0.001)
})

test('auto battle does nothing while the match is not running', () => {
  const clock = new AutoBattleClock()
  const idle = clock.step(5_000, query(['p1'], ['p8'], () => 0.5, false))
  assert.equal(idle.length, 0)
  assert.equal(clock.canadaAutoAttacker, null)
  assert.equal(clock.usaAutoAttacker, null)
})
