import assert from 'node:assert/strict'
import test from 'node:test'
import { battleConfig } from '../src/config/battleConfig.ts'
import { resolveGift } from '../src/config/tiktokGifts.ts'
import { styleOf } from '../src/game/attacks/style.ts'
import { interpretSocketText } from '../src/integrations/tiktok/LiveTikTokAdapter.ts'
import { acceptEvent, acceptSocial, decideJoin, giftCountsTowardScore, likeShotPlan } from '../src/preflight/rules.ts'
import { AttackSystem } from '../src/systems/AttackSystem.ts'
import { BattleSystem } from '../src/systems/BattleSystem.ts'
import { giftPower } from '../src/systems/giftPower.ts'
import { DamageSystem } from '../src/systems/DamageSystem.ts'
import { PlayerSystem } from '../src/systems/PlayerSystem.ts'
import { chatAction } from '../src/utils/team.ts'
import { commentOf, GiftStreaks } from '../server/eventNormalizer.ts'
import { SessionTeams, teamCommand as serverTeamCommand } from '../server/teams.ts'
import type { CatalogGift } from '../server/types.ts'
import type { AttackCommand } from '../src/types/Battle.ts'
import type { WebcastGiftMessage } from 'tiktok-live-connector'

test('websocket like updates the enemy health once', () => {
  const message = interpretSocketText(
    JSON.stringify({ type: 'likeReceived', payload: { userId: 'u1', username: 'ana', avatarUrl: '', team: 'red', count: 4, eventId: 'evt-like' } }),
  )
  assert.ok(message && message.type === 'likeReceived')
  const seen = new Set<string>()
  assert.equal(acceptEvent(seen, message.payload.eventId), true)
  assert.equal(acceptEvent(seen, message.payload.eventId), false)
  const plan = likeShotPlan(message.payload.count)
  const battle = new BattleSystem()
  battle.status = 'running'
  const damage = new DamageSystem()
  let dealt = 0
  for (let shot = 0; shot < plan.shots; shot += 1) dealt += damage.apply('red', plan.damageEach, battle.red, battle.blue).dealt
  assert.equal(battle.red.health, battleConfig.maxHealth)
  assert.equal(battle.blue.health, battleConfig.maxHealth - dealt)
  assert.ok(Math.abs(dealt - plan.totalDamage) < 0.001)
})

test('normalized live events keep one shape and trim team commands', () => {
  const join = interpretSocketText(JSON.stringify({ type: 'chat', userId: 'u9', username: 'sam', comment: ' c ' }))
  assert.ok(join && join.type === 'chatReceived')
  assert.deepEqual(chatAction(join.payload.text), { type: 'join', team: 'red' })
  const usa = interpretSocketText(JSON.stringify({ type: 'chat', userId: 'u10', username: 'sam', comment: 'U ' }))
  assert.ok(usa && usa.type === 'chatReceived')
  assert.deepEqual(chatAction(usa.payload.text), { type: 'join', team: 'blue' })
  const like = interpretSocketText(JSON.stringify({ type: 'like', userId: 'u9', username: 'sam', count: 4, team: 'red' }))
  assert.ok(like && like.type === 'likeReceived')
  assert.equal(like.payload.count, 4)
  const gift = interpretSocketText(
    JSON.stringify({ type: 'gift', userId: 'u9', username: 'sam', giftName: 'Rose', giftId: 5655, diamonds: 1, repeatCount: 2, repeatEnd: true, team: 'canada' }),
  )
  assert.ok(gift && gift.type === 'giftReceived')
  assert.equal(gift.payload.giftId, '5655')
  assert.equal(gift.payload.giftCount, 2)
  assert.equal(gift.payload.coinValue, 1)
  assert.equal(gift.payload.team, 'red')
  assert.equal(gift.payload.repeatEnd, true)
})

test('comment C joins Canada and a sentence does not', () => {
  const join = interpretSocketText(JSON.stringify({ type: 'chatReceived', payload: { userId: 'u2', username: 'sam', text: 'C' } }))
  assert.ok(join && join.type === 'chatReceived')
  const action = chatAction(join.payload.text)
  assert.deepEqual(action, { type: 'join', team: 'red' })
  const players = new PlayerSystem()
  assert.equal(decideJoin(null, action.team, true), 'create')
  players.add({ id: 'u2', username: 'sam', team: action.team, avatarUrl: '', avatarKey: '', initials: 'S' })
  assert.equal(players.players.get('u2')?.team, 'red')
  const chatter = interpretSocketText(JSON.stringify({ type: 'chatReceived', payload: { userId: 'u3', username: 'mia', text: 'see you at canada' } }))
  assert.ok(chatter && chatter.type === 'chatReceived')
  assert.equal(chatAction(chatter.payload.text).type, 'comment')
})

test('typed C or U moves an existing player instead of duplicating them', () => {
  const players = new PlayerSystem()
  players.add({ id: 'u7', username: 'kai', team: 'red', avatarUrl: 'https://cdn.example/k.png', avatarKey: '', initials: 'K' })
  const existing = players.players.get('u7') ?? null
  assert.equal(decideJoin(existing, 'blue', false), 'keep')
  assert.equal(decideJoin(existing, 'blue', true), 'switch')
  players.setTeam('u7', 'blue')
  assert.equal(players.players.size, 1)
  assert.equal(players.bodies.get('u7')?.team, 'blue')
  assert.equal(players.players.get('u7')?.avatarUrl, 'https://cdn.example/k.png')
  assert.deepEqual(players.counts(), { red: 0, blue: 1 })
  assert.equal(decideJoin(players.players.get('u7') ?? null, 'red', true), 'switch')
  assert.equal(chatAction('  u ').type, 'join')
  assert.equal(chatAction('you are cool').type, 'comment')
})

test('only a whole C, Canada, U, or USA comment picks a team', () => {
  for (const text of ['C', 'c', ' C ', 'Canada', 'CANADA', '\u00a0c\u200b']) assert.equal(serverTeamCommand(text), 'red', JSON.stringify(text))
  for (const text of ['ca', 'CA!', 'canadian', '🇨🇦']) assert.equal(serverTeamCommand(text), 'red', JSON.stringify(text))
  for (const text of ['U', 'u', ' U ', 'usa', 'USA', 'USA!!!', 'us', 'america', '🇺🇸']) assert.equal(serverTeamCommand(text), 'blue', JSON.stringify(text))
  for (const text of ['cute', 'cool', 'c u later', 'you', 'go canada']) {
    assert.equal(serverTeamCommand(text), null, JSON.stringify(text))
    assert.equal(chatAction(text).type, 'comment', JSON.stringify(text))
  }
  assert.equal(commentOf({ comment: ' C ' }), 'C')
  assert.equal(commentOf({ content: 'usa' }), 'usa')
  assert.deepEqual(chatAction('canada'), { type: 'join', team: 'red' })
  assert.deepEqual(chatAction('ca'), { type: 'join', team: 'red' })
  assert.deepEqual(chatAction('USA'), { type: 'join', team: 'blue' })
  assert.deepEqual(chatAction('america'), { type: 'join', team: 'blue' })
})

test('an explicit team join keeps the switch flag', () => {
  const message = interpretSocketText(JSON.stringify({
    type: 'join',
    userId: 'TestCanada',
    username: 'TestCanada',
    avatarUrl: '',
    team: 'red',
    explicit: true,
    eventId: 'team-1',
  }))
  assert.ok(message && message.type === 'viewerJoined')
  assert.equal(message.payload.team, 'red')
  assert.equal(message.payload.explicit, true)
  assert.equal(message.payload.userId, 'TestCanada')
})

test('a new viewer is on screen right away even when the side is full of field fillers', () => {
  const players = new PlayerSystem()
  for (let i = 0; i < battleConfig.rosterRed + 4; i += 1) {
    const filler = players.addGenerated('red', false)
    filler.battlePoints = 500 + i
  }
  players.add({ id: '7575313827664004108', username: 'zane23409', team: 'red', avatarUrl: 'https://cdn.example/z.png', avatarKey: '', initials: 'Z' })
  players.spotlight('7575313827664004108')
  players.update(1 / 60, 0)
  assert.equal(players.bodies.get('7575313827664004108')?.shown, 1)
  for (let i = 0; i < 60 * 20; i += 1) players.update(1 / 20, i / 20)
  assert.equal(players.bodies.get('7575313827664004108')?.shown, 1, 'a real viewer outranks fillers after the spotlight ends')
  players.setTeam('7575313827664004108', 'blue')
  players.spotlight('7575313827664004108')
  players.update(1 / 60, 0)
  assert.equal(players.players.size, battleConfig.rosterRed + 5)
  assert.equal(players.bodies.get('7575313827664004108')?.team, 'blue')
  assert.equal(players.bodies.get('7575313827664004108')?.shown, 1)
})

test('gift value sets clearly different power tiers', () => {
  const small = giftPower(1)
  const medium = giftPower(199)
  const large = giftPower(1_000)
  const vip = giftPower(30_000)
  assert.deepEqual([small.tier, medium.tier, large.tier, vip.tier], ['small', 'medium', 'large', 'vip'])
  assert.ok(Math.abs(small.growth - 1.25) < 0.01)
  assert.ok(Math.abs(medium.growth - 1.5) < 0.01)
  assert.ok(Math.abs(large.growth - 1.8) < 0.01)
  assert.ok(vip.growth >= 2 && vip.growth <= 2.3)
  assert.ok(small.size < medium.size && medium.size < large.size && large.size < vip.size)
  assert.ok(vip.pace < small.pace)
})

test('a gift power-up grows the circle at once and settles back to normal', () => {
  const players = new PlayerSystem()
  players.add({ id: 'g1', username: 'vip', team: 'blue', avatarUrl: '', avatarKey: '', initials: 'V' })
  players.powerUp('g1', 2.2, 0.4)
  for (let frame = 0; frame < 8; frame += 1) players.update(1 / 60, frame / 60)
  assert.ok((players.bodies.get('g1')?.giftMul ?? 1) > 1.8)
  for (let frame = 0; frame < 180; frame += 1) players.update(1 / 60, frame / 60)
  assert.equal(players.bodies.get('g1')?.giftMul, 1)
})

test('queued attacks, including several legendary ones, are all released together', () => {
  const attacks = new AttackSystem()
  const base: Omit<AttackCommand, 'id'> = { attackType: 'energy_bullet', team: 'red', fromX: 0.2, fromY: 0.5, toX: 0.8, toY: 0.5, intensity: 1, duration: 0.3, damage: 1, shake: 'none', particleIntensity: 0, sound: 'projectile', priority: 2, username: 'a', giftName: 'Like', combo: 1, rarity: 'micro', impacts: [0.74] }
  for (let i = 0; i < 5; i += 1) attacks.enqueue({ ...base })
  attacks.enqueue({ ...base, giftName: 'Galaxy', rarity: 'legendary', priority: 5 })
  attacks.enqueue({ ...base, giftName: 'Lion', rarity: 'legendary', priority: 5 })
  assert.equal(attacks.pull(1).length, 7)
  assert.equal(attacks.pending, 0)
})

test('a ready attack creates its projectile in the same call', () => {
  const attacks = new AttackSystem()
  const base: Omit<AttackCommand, 'id'> = { attackType: 'energy_bullet', team: 'red', fromX: 0.2, fromY: 0.5, toX: 0.8, toY: 0.5, intensity: 1, duration: 0.3, damage: 1, shake: 'none', particleIntensity: 0, sound: 'projectile', priority: 2, username: 'a', giftName: 'Like', combo: 1, rarity: 'micro', impacts: [0.74] }
  const born: number[] = []
  attacks.spawnNow = () => {
    born.push(performance.now())
    return true
  }
  const received: number[] = []
  for (let i = 0; i < 10; i += 1) {
    received.push(performance.now())
    attacks.enqueue({ ...base })
  }
  assert.equal(born.length, 10)
  assert.equal(attacks.pending, 0)
  for (let i = 0; i < 10; i += 1) assert.ok(born[i]! - received[i]! < 5)
  attacks.spawnNow = (command) => command.ambient === true ? false : (born.push(performance.now()), true)
  attacks.enqueue({ ...base, ambient: true, rarity: 'large', giftName: 'Galaxy' })
  assert.equal(attacks.queue.length, 1)
  assert.equal(born.length, 10)
})

test('follow and share each grow the score once', () => {
  const seen = new Set<string>()
  let score = 0
  const follow = () => {
    if (!acceptSocial(seen, 'follow', 'ana')) return
    score += battleConfig.followScore
  }
  follow()
  follow()
  const share = () => {
    if (!acceptSocial(seen, 'share', 'ana')) return
    score += battleConfig.shareScore
  }
  share()
  share()
  assert.equal(score, battleConfig.followScore + battleConfig.shareScore)
})

test('gift streak scores only at repeatEnd and maps the attack', () => {
  const streaks = new GiftStreaks()
  const teams = new SessionTeams()
  const catalog = new Map<string, CatalogGift>()
  const user = { id: 'u4', displayId: 'ana', nickname: 'Ana' }
  const message = (repeatCount: number, repeatEnd: number) =>
    ({
      user,
      giftId: 5655,
      repeatCount,
      repeatEnd,
      gift: { type: 1, name: 'Rose', diamondCount: 1, id: 5655 },
    }) as unknown as WebcastGiftMessage
  const preview = streaks.decide(message(2, 0), teams, catalog)
  assert.equal(preview?.payload?.preview, true)
  assert.equal(preview?.payload?.repeatEnd, false)
  assert.equal(giftCountsTowardScore({ giftName: 'Rose', preview: true, repeatEnd: false }), false)
  const finalGift = streaks.decide(message(2, 1), teams, catalog)
  assert.equal(finalGift?.payload?.repeatEnd, true)
  assert.equal(giftCountsTowardScore({ giftName: finalGift?.payload?.giftName ?? 'Rose', repeatEnd: true }), true)
  assert.equal(streaks.decide(message(2, 1), teams, catalog), null)
  const rose = resolveGift('rose', 'Rose')
  assert.equal(styleOf({ giftName: rose.displayName, attackType: rose.attackType, rarity: rose.rarity }), 'rose')
  const unknown = resolveGift('custom-box', 'Custom Box', 15)
  assert.equal(unknown.coinValue, 15)
  assert.equal(unknown.scoreValue, 15)
})

test('a defeated player disappears and the next battle starts clean', () => {
  const players = new PlayerSystem()
  players.add({ id: 'u5', username: 'ace', team: 'blue', avatarUrl: 'https://cdn.example/a.png', avatarKey: '', initials: 'A' })
  players.strike('u5', 500)
  for (let frame = 0; frame < 40; frame += 1) players.update(0.05, frame)
  assert.equal(players.players.has('u5'), false)
  players.add({ id: 'u5', username: 'ace', team: 'blue', avatarUrl: '', avatarKey: '', initials: 'A' })
  assert.equal(players.players.size, 1)
  assert.equal(players.players.get('u5')?.battlePoints, 0)
  const battle = new BattleSystem()
  battle.beginCountdown()
  battle.status = 'running'
  battle.red.health = 0
  battle.blue.score = 80
  assert.equal(battle.wipeWinner(), 'blue')
  assert.equal(battle.lockVictory('blue', [], []), true)
  battle.markResetting()
  players.clear()
  battle.beginCountdown()
  assert.equal(players.players.size, 0)
  assert.equal(battle.status, 'countdown')
  assert.equal(battle.blue.score, 0)
  assert.equal(battle.red.health, battleConfig.maxHealth)
  assert.equal(battle.victory, null)
})
