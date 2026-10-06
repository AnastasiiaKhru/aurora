import assert from 'node:assert/strict'
import test from 'node:test'
import { battleConfig } from '../src/config/battleConfig.ts'
import { resolveGift } from '../src/config/tiktokGifts.ts'
import { styleOf } from '../src/game/attacks/style.ts'
import { interpretSocketText } from '../src/integrations/tiktok/LiveTikTokAdapter.ts'
import { acceptEvent, acceptSocial, decideJoin, giftCountsTowardScore, likeShotPlan } from '../src/preflight/rules.ts'
import { BattleSystem } from '../src/systems/BattleSystem.ts'
import { DamageSystem } from '../src/systems/DamageSystem.ts'
import { PlayerSystem } from '../src/systems/PlayerSystem.ts'
import { chatAction } from '../src/utils/team.ts'
import { GiftStreaks } from '../server/eventNormalizer.ts'
import { SessionTeams } from '../server/teams.ts'
import type { CatalogGift } from '../server/types.ts'
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

test('comment C joins Canada and a sentence does not', () => {
  const join = interpretSocketText(JSON.stringify({ type: 'chatReceived', payload: { userId: 'u2', username: 'sam', text: 'C' } }))
  assert.ok(join && join.type === 'chatReceived')
  const action = chatAction(join.payload.text)
  assert.deepEqual(action, { type: 'join', team: 'red' })
  const players = new PlayerSystem()
  assert.equal(decideJoin(null, action.team, true, false), 'create')
  players.add({ id: 'u2', username: 'sam', team: action.team, avatarUrl: '', avatarKey: '', initials: 'S' })
  assert.equal(players.players.get('u2')?.team, 'red')
  const chatter = interpretSocketText(JSON.stringify({ type: 'chatReceived', payload: { userId: 'u3', username: 'mia', text: 'see you at canada' } }))
  assert.ok(chatter && chatter.type === 'chatReceived')
  assert.equal(chatAction(chatter.payload.text).type, 'comment')
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
