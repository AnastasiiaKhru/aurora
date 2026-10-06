import { battleConfig } from '../config/battleConfig.ts'
import { resolveGift } from '../config/tiktokGifts.ts'
import { LIMITER_THRESHOLD_DB } from '../audio/AudioManager.ts'
import { backgroundMusicConfig, fallbackTrackSrc } from '../audio/audioConfig.ts'
import {
  AVATAR_LEADER,
  AVATAR_MAX,
  BOTTOM_SAFE_ZONE,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  GAMEPLAY_END,
  MAX_IMPACT_Y,
  MAX_PLAYER_Y,
  MIN_PLAYER_Y,
  TOP_SAFE_ZONE,
  broadcastScale,
  clampedAttackScale,
  permanentAvatarDiameter,
} from '../broadcast/stage.ts'
import { attackStyles, styleOf, styles } from '../game/attacks/style.ts'
import { playY } from '../game/attacks/motion.ts'
import { BattleSystem } from '../systems/BattleSystem.ts'
import { DamageSystem } from '../systems/DamageSystem.ts'
import { PlayerSystem } from '../systems/PlayerSystem.ts'
import { teamBox } from '../systems/playerMotion.ts'
import { chatAction, teamCommand } from '../utils/team.ts'
import { safeAvatarUrl } from '../utils/avatar.ts'
import {
  acceptEvent,
  acceptSocial,
  decideJoin,
  giftCountsTowardScore,
  likeShotPlan,
  shouldOpenSocket,
} from './rules.ts'
import type { CheckId, CheckState } from './session.ts'
import type { AttackStyle } from '../game/attacks/style.ts'
import type { TeamId } from '../types/Team.ts'

export interface LogicResult {
  id: CheckId
  status: CheckState
  detail: string
}

const NAMED: Record<AttackStyle, string> = {
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

const LAYOUT_SIZES: Array<[number, number]> = [
  [360, 640],
  [405, 720],
  [540, 960],
  [720, 1280],
  [1080, 1920],
  [1600, 900],
]

function fail(errors: string[]): LogicResult['status'] {
  return errors.length === 0 ? 'pass' : 'fail'
}

export function checkJoin(): LogicResult {
  const errors: string[] = []
  const expect: Array<[string, TeamId | null]> = [
    ['C', 'red'],
    ['c', 'red'],
    [' C ', 'red'],
    ['Canada', 'red'],
    ['CANADA', 'red'],
    ['U', 'blue'],
    ['u', 'blue'],
    [' U ', 'blue'],
    ['usa', 'blue'],
    ['USA', 'blue'],
    ['USA!!!', null],
    ['cute', null],
    ['cool', null],
    ['go canada', null],
    ['see you', null],
    ['c u later', null],
    ['canada wins', null],
  ]
  for (const [text, team] of expect) {
    const parsed = teamCommand(text)
    if (parsed !== team) errors.push(`${JSON.stringify(text)} parsed as ${String(parsed)}`)
    const action = chatAction(text)
    if (team == null && action.type !== 'comment') errors.push(`${JSON.stringify(text)} joined`)
    if (team != null && (action.type !== 'join' || action.team !== team)) errors.push(`${JSON.stringify(text)} did not join ${team}`)
  }
  const players = new PlayerSystem()
  const join = (id: string, preferred: TeamId, explicit: boolean) => {
    const existing = players.players.get(id) ?? null
    const decision = decideJoin(existing, preferred, explicit)
    if (decision === 'create') players.add({ id, username: id, team: preferred, avatarUrl: '', avatarKey: '', initials: 'A' })
    else if (decision === 'switch' && existing) players.setTeam(id, preferred)
    return decision
  }
  const sides = () => [...players.players.values()].filter((player) => player.id === 'ana').map((player) => player.team)
  if (join('ana', 'red', true) !== 'create') errors.push('first join did not create')
  if (players.players.size !== 1) errors.push('duplicate player record')
  if (join('ana', 'red', true) !== 'keep') errors.push('active player created a second circle')
  if (players.players.size !== 1) errors.push('second join duplicated the circle')
  if (join('ana', 'blue', false) !== 'keep') errors.push('implicit event moved a player')
  if (join('ana', 'blue', true) !== 'switch') errors.push('typed U did not switch a Canada player')
  if (sides().join() !== 'blue' || players.bodies.size !== 1) errors.push('switched player is not only on USA')
  if (join('ana', 'red', true) !== 'switch') errors.push('typed C did not switch a USA player back')
  if (sides().join() !== 'red' || players.bodies.size !== 1) errors.push('switched player is not only on Canada')
  players.strike('ana', 10_000)
  for (let frame = 0; frame < 40; frame += 1) players.update(0.05, frame)
  if (players.players.has('ana')) errors.push('eliminated player stayed on the field')
  if (join('ana', 'blue', true) !== 'create') errors.push('eliminated player could not rejoin')
  const rejoined = players.players.get('ana')
  if (!rejoined || rejoined.team !== 'blue' || rejoined.battlePoints !== 0) errors.push('rejoin kept old state')
  if (players.bodies.size !== 1) errors.push('rejoin duplicated a body')
  return { id: 'join', status: fail(errors), detail: errors[0] ?? 'Chat commands, team switches, and rejoin passed' }
}

export function checkInteractions(): LogicResult {
  const errors: string[] = []
  const seen = new Set<string>()
  if (!acceptEvent(seen, 'like-1')) errors.push('first event was dropped')
  if (acceptEvent(seen, 'like-1')) errors.push('duplicate event was accepted')
  if (!acceptEvent(seen, undefined)) errors.push('event without an id was dropped')
  const social = new Set<string>()
  if (!acceptSocial(social, 'follow', 'ana')) errors.push('first follow was dropped')
  if (acceptSocial(social, 'follow', 'ana')) errors.push('follow fired twice')
  if (!acceptSocial(social, 'share', 'ana')) errors.push('share was blocked by follow')
  if (acceptSocial(social, 'share', 'ana')) errors.push('share fired twice')
  const rapid = likeShotPlan(100)
  if (rapid.amount !== 100) errors.push('rapid likes were not counted')
  if (rapid.shots > 14) errors.push('rapid likes spawned too many shots')
  if (Math.abs(rapid.totalDamage - battleConfig.likeShotDamage * 5) > 0.001) errors.push('like damage was not capped once')
  const one = likeShotPlan(1)
  const battle = new BattleSystem()
  battle.status = 'running'
  const redHealth = battle.red.health
  const damage = new DamageSystem()
  let dealt = 0
  for (let shot = 0; shot < one.shots; shot += 1) dealt += damage.apply('red', one.damageEach, battle.red, battle.blue).dealt
  if (battle.red.health !== redHealth) errors.push('like damaged the attacking team')
  if (Math.abs(battle.blue.health - (battle.blue.maxHealth - dealt)) > 0.001) errors.push('like missed the enemy')
  if (!giftCountsTowardScore({ giftName: 'Rose', repeatEnd: true })) errors.push('finished gift did not score')
  if (giftCountsTowardScore({ giftName: 'Rose', repeatEnd: false })) errors.push('streak scored before repeatEnd')
  if (giftCountsTowardScore({ giftName: 'Rose', preview: true, repeatEnd: true })) errors.push('preview gift scored')
  if (!shouldOpenSocket(false, null)) errors.push('first socket was blocked')
  if (shouldOpenSocket(false, 1)) errors.push('open socket was allowed to connect again')
  if (shouldOpenSocket(true, null)) errors.push('stopped adapter reconnected')
  if (shouldOpenSocket(false, 0)) errors.push('connecting socket opened a second connection')
  return { id: 'interactions', status: fail(errors), detail: errors[0] ?? 'Likes, follow, share, and duplicate events passed' }
}

export function checkGifts(): LogicResult {
  const errors: string[] = []
  const rose = resolveGift('rose', 'Rose')
  if (styleOf({ giftName: rose.displayName, attackType: rose.attackType, rarity: rose.rarity }) !== 'rose') {
    errors.push('Rose did not map to Living Rose Strike')
  }
  const unknown = resolveGift('not-a-catalog-gift', 'Mystery Box', 20)
  if (unknown.coinValue !== 20 || unknown.scoreValue !== 20) errors.push('unknown gift ignored its coin value')
  if (unknown.baseDamage < 0) errors.push('unknown gift damage was negative')
  const blank = resolveGift('missing', undefined, -5)
  if (blank.coinValue !== 0) errors.push('negative coins were not clamped')
  for (const style of attackStyles) {
    const spec = styles[style]
    if (spec.giftName.length === 0) errors.push(`${style} has no name`)
    if (NAMED[style].length === 0) errors.push(`${style} is unnamed`)
    for (const team of ['red', 'blue'] as const) {
      const resolved = styleOf({ giftName: spec.giftName, attackType: spec.attackType, rarity: spec.rarity })
      if (resolved !== style) errors.push(`${NAMED[style]} for ${team} resolved to ${resolved}`)
      const box = teamBox(team, true)
      if (team === 'red' && box.x1 > DESIGN_WIDTH / 2) errors.push('Canada attack lane crossed the center')
      if (team === 'blue' && box.x0 < DESIGN_WIDTH / 2) errors.push('USA attack lane crossed the center')
    }
    if (spec.impacts.length === 0) errors.push(`${NAMED[style]} has no impact`)
    if (spec.permanentGrowth <= 0) errors.push(`${NAMED[style]} has no growth`)
  }
  return { id: 'gifts', status: fail(errors), detail: errors[0] ?? 'Gift mappings and the ten attacks resolved' }
}

export function checkReset(): LogicResult {
  const errors: string[] = []
  const battle = new BattleSystem()
  for (let round = 0; round < 10; round += 1) {
    battle.beginCountdown()
    if (battle.status !== 'countdown' || battle.victory) errors.push(`round ${round + 1} did not start clean`)
    if (battle.red.score !== 0 || battle.blue.score !== 0) errors.push(`round ${round + 1} kept score`)
    battle.status = 'running'
    battle.red.score = 40 + round
    battle.blue.health = 0
    const winner = battle.wipeWinner()
    if (winner !== 'red') errors.push(`round ${round + 1} winner was ${String(winner)}`)
    if (!battle.lockVictory(winner ?? 'draw', [], [])) errors.push(`round ${round + 1} did not lock`)
    if (battle.lockVictory('blue', [], [])) errors.push(`round ${round + 1} victory fired twice`)
    if (battle.wipeWinner() !== null) errors.push(`round ${round + 1} kept looking for a winner`)
    battle.markResetting()
  }
  battle.beginCountdown()
  if (battle.red.health !== battleConfig.maxHealth || battle.blue.score !== 0) errors.push('the battle after reset was dirty')
  if (battle.status !== 'countdown') errors.push('reset did not return to countdown')
  return { id: 'reset', status: fail(errors), detail: errors[0] ?? 'Ten battles reset in a row' }
}

export function checkZones(): LogicResult {
  const errors: string[] = []
  if (TOP_SAFE_ZONE !== 260 || GAMEPLAY_END !== 1250 || BOTTOM_SAFE_ZONE !== 670) errors.push('safe-zone constants moved')
  if (MIN_PLAYER_Y !== 650 || MAX_PLAYER_Y !== 1200) errors.push('player vertical bounds moved')
  if (MAX_IMPACT_Y > GAMEPLAY_END) errors.push('impacts enter the chat zone')
  const canada = teamBox('red', false)
  const usa = teamBox('blue', false)
  if (canada.x1 >= usa.x0) errors.push('team lanes overlap')
  if (canada.y0 < MIN_PLAYER_Y || usa.y1 > MAX_PLAYER_Y) errors.push('wander box leaves the player band')
  for (const [width, height] of LAYOUT_SIZES) {
    const scale = broadcastScale(width, height)
    const stageW = DESIGN_WIDTH * scale
    const stageH = DESIGN_HEIGHT * scale
    if (stageW > width + 0.01 || stageH > height + 0.01) errors.push(`${width}x${height} overflows`)
    const aspect = stageW / stageH
    if (Math.abs(aspect - DESIGN_WIDTH / DESIGN_HEIGHT) > 0.0001) errors.push(`${width}x${height} is not 9:16`)
  }
  const low = playY(0.95, DESIGN_HEIGHT)
  if (low > 1240) errors.push('attack travel enters the chat zone')
  return { id: 'zones', status: fail(errors), detail: errors[0] ?? '9:16 stage and safe zones hold at every capture size' }
}

export function checkGrowthAndDamage(): string[] {
  const errors: string[] = []
  const players = new PlayerSystem()
  players.add({ id: 'ace', username: 'Ace', team: 'red', avatarUrl: '', avatarKey: '', initials: 'A' })
  for (let i = 0; i < 80; i += 1) players.cast('ace', 1.5, 0.05, true)
  const body = players.bodies.get('ace')
  if (!body || body.power > 0.32) errors.push('permanent growth passed 0.32')
  const leader = permanentAvatarDiameter(body?.power ?? 0, true)
  const regular = permanentAvatarDiameter(body?.power ?? 0, false)
  if (leader > AVATAR_LEADER || regular > AVATAR_MAX) errors.push('avatar diameter passed its cap')
  const rest = clampedAttackScale(1 + (body?.power ?? 0), body?.power ?? 0, 1.5)
  if (Math.abs(rest - 1) > 0.001) errors.push('temporary scale did not return to 1')
  const damage = new DamageSystem()
  const battle = new BattleSystem()
  const portion = 30 / 2
  const first = damage.apply('blue', portion, battle.red, battle.blue)
  const second = damage.apply('blue', portion, battle.red, battle.blue)
  if (first.target !== 'red' || second.target !== 'red') errors.push('damage hit the wrong team')
  if (Math.abs(battle.red.health - (battle.red.maxHealth - 30)) > 0.001) errors.push('damage was applied more than once')
  if (battle.blue.health !== battle.blue.maxHealth) errors.push('attacker lost health')
  const art = safeAvatarUrl('', 'A', 10, 3)
  if (!art.url.startsWith('/avatars/')) errors.push('missing avatar had no fallback')
  const bad = safeAvatarUrl('javascript:alert(1)', 'A', 10, 3)
  if (bad.url.startsWith('javascript:')) errors.push('unsafe avatar URL was kept')
  return errors
}

export function checkMovement(): string[] {
  const errors: string[] = []
  for (const count of [1, 10, 25, 50]) {
    const players = new PlayerSystem()
    for (let i = 0; i < count; i += 1) players.addGenerated(i % 2 === 0 ? 'red' : 'blue', false)
    players.layoutAll()
    for (let frame = 0; frame < 90; frame += 1) players.update(1 / 60, frame / 60)
    let red = 0
    let blue = 0
    for (const body of players.bodies.values()) {
      if (body.shown === 0) continue
      const x = body.x * DESIGN_WIDTH
      const y = body.y * DESIGN_HEIGHT
      if (y < MIN_PLAYER_Y - 1 || y > MAX_PLAYER_Y + 1) errors.push(`${count} players left the vertical band`)
      if (body.team === 'red') {
        red += 1
        if (x > DESIGN_WIDTH / 2) errors.push('Canada crossed into USA')
      } else {
        blue += 1
        if (x < DESIGN_WIDTH / 2) errors.push('USA crossed into Canada')
      }
    }
    if (red > 12 || blue > 12) errors.push(`${count} players showed more than 12 per team`)
  }
  return errors
}

export function checkAudioConfig(): string[] {
  const errors: string[] = []
  if (LIMITER_THRESHOLD_DB > -1) errors.push('limiter sits above -1 dB')
  if (!backgroundMusicConfig.src || !fallbackTrackSrc) errors.push('a track path is missing')
  if (backgroundMusicConfig.defaultVolume < 0 || backgroundMusicConfig.defaultVolume > 1) errors.push('default volume is out of range')
  return errors
}

export function runLogicChecks(): LogicResult[] {
  const growth = checkGrowthAndDamage()
  const movement = checkMovement()
  const join = checkJoin()
  const interactions = checkInteractions()
  const gifts = checkGifts()
  const reset = checkReset()
  const zones = checkZones()
  const zoneErrors = [...(zones.status === 'fail' ? [zones.detail] : []), ...movement]
  return [
    join,
    interactions,
    { ...gifts, status: gifts.status === 'fail' || growth.length > 0 ? 'fail' : 'pass', detail: gifts.status === 'fail' ? gifts.detail : growth[0] ?? gifts.detail },
    reset,
    { id: 'zones', status: zoneErrors.length === 0 ? 'pass' : 'fail', detail: zoneErrors[0] ?? zones.detail },
  ]
}
