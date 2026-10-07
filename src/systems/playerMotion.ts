import { AVATAR_BASE, DESIGN_HEIGHT, DESIGN_WIDTH, GAMEPLAY_END, GAMEPLAY_START, MAX_PLAYER_Y, MIN_PLAYER_Y, permanentAvatarDiameter } from '../broadcast/stage.ts'
import type { PlayerBody } from './PlayerSystem.ts'
import type { TeamId } from '../types/Team.ts'
import { clamp, hashString } from '../utils/math.ts'

const ROAM_SPEED = 2.65
/** Lowest point an avatar circle may reach. Below this stays clear for TikTok chat. */
export const ROAM_BOTTOM = 1540
const EDGE_PAD = 16
const CENTER_GAP = 28
const CELL = 180
const VISIBLE_CAP = 12

const playfield = {
  safeTop: GAMEPLAY_START + 20,
  safeBottom: GAMEPLAY_END - 20,
}

export const motionDebug = {
  bounds: false,
  collisions: false,
  forceReduced: false,
}

export type PlayerMotionState =
  | 'idle'
  | 'wander'
  | 'charge'
  | 'attack'
  | 'recoil'
  | 'hit'
  | 'stunned'
  | 'celebrate'
  | 'defeated'

export interface MotionMood {
  finalTen: boolean
  lead: TeamId | null
  hidden: boolean
  settled?: boolean
}

export interface MotionEntry {
  body: PlayerBody
  username: string
  points: number
  /** A real TikTok viewer rather than a generated field filler. */
  real?: boolean
  /** Just joined or switched sides; must be on screen right away. */
  fresh?: boolean
}

let reduceMedia = false
if (typeof matchMedia === 'function') {
  const query = matchMedia('(prefers-reduced-motion: reduce)')
  reduceMedia = query.matches
  query.addEventListener?.('change', () => {
    reduceMedia = query.matches
  })
}

export function motionReduced(): boolean {
  return motionDebug.forceReduced || reduceMedia
}

interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
}

export function syncPlayfield(): void {
  playfield.safeBottom = GAMEPLAY_END - 20
  if (typeof document === 'undefined') return
  const stage = document.getElementById('aurora-stage')
  if (!stage) return
  const stageRect = stage.getBoundingClientRect()
  if (stageRect.height < 8) return
  let bottom = 0
  for (const selector of ['.scoreboard', '.join-instruction', '.power-menu']) {
    const node = stage.querySelector(selector)
    if (!(node instanceof HTMLElement)) continue
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const rect = node.getBoundingClientRect()
    const y = ((rect.bottom - stageRect.top) / stageRect.height) * DESIGN_HEIGHT
    if (Number.isFinite(y)) bottom = Math.max(bottom, y)
  }
  if (bottom > 80) playfield.safeTop = bottom + 20
}

export function teamBox(team: TeamId, _attacking = false, radius = AVATAR_BASE / 2): Box {
  const mid = DESIGN_WIDTH / 2
  const room = mid - CENTER_GAP - EDGE_PAD
  const r = Math.max(12, Math.min(radius, Math.max(12, room / 2 - 8)))
  const boundaryTop = Math.max(GAMEPLAY_START + 8, playfield.safeTop)
  const boundaryBottom = ROAM_BOTTOM
  let y0 = boundaryTop + r
  let y1 = boundaryBottom - r
  if (y1 < y0 + 24) {
    const midY = clamp((MIN_PLAYER_Y + MAX_PLAYER_Y) / 2, MIN_PLAYER_Y + 12, MAX_PLAYER_Y - 12)
    y0 = midY - 12
    y1 = midY + 12
  }
  if (team === 'red') return { x0: EDGE_PAD + r, x1: mid - CENTER_GAP - r, y0, y1 }
  return { x0: mid + CENTER_GAP + r, x1: DESIGN_WIDTH - EDGE_PAD - r, y0, y1 }
}

export function ensureMotionFields(body: PlayerBody, username: string): void {
  if (typeof body.persona !== 'number' || body.persona < 0) body.persona = hashString(username) % 8
  if (!body.motion) body.motion = 'wander'
  if (typeof body.goalWait !== 'number') body.goalWait = 0
  if (typeof body.goalSerial !== 'number') body.goalSerial = 0
  if (typeof body.lean !== 'number') body.lean = 0
  if (typeof body.trail !== 'number') body.trail = 0
  if (typeof body.shown !== 'number') body.shown = 1
  if (typeof body.motionR !== 'number') body.motionR = AVATAR_BASE / 2
  if (typeof body.cheer !== 'number') body.cheer = 0
  if (typeof body.stun !== 'number') body.stun = 0
  if (typeof body.kick !== 'number') body.kick = 0
  if (typeof body.lunge !== 'number') body.lunge = 0
  if (typeof body.vx !== 'number') body.vx = 0
  if (typeof body.vy !== 'number') body.vy = 0
  if (!(body.speed >= 20)) {
    const seed = hashString(`${body.id}:${username}`)
    const base = 25 + (seed % 21)
    const mul = 0.85 + ((seed % 351) / 350) * 0.35
    body.speed = base * mul
  }
  if (!(body.curve > 0)) {
    const seed = hashString(`${username}:${body.id}:curve`)
    body.curve = 4 + (seed % 7)
  }
}

export function stepPlayerMotion(entries: MotionEntry[], dt: number, time: number, mood: MotionMood): { red: number; blue: number } {
  syncPlayfield()
  const step = Math.min(0.05, Math.max(0, dt))
  const reduced = motionReduced()
  const shown = assignVisible(entries)
  const hidden = { red: 0, blue: 0 }
  for (const entry of entries) {
    if (entry.body.shown === 0) hidden[entry.body.team] += 1
  }
  if (step <= 0) {
    for (const entry of entries) clampBody(entry.body)
    return hidden
  }

  const leaders = new Set<string>()
  for (const team of ['red', 'blue'] as const) {
    let best: MotionEntry | null = null
    for (const entry of entries) {
      if (entry.body.team !== team || entry.points <= 0) continue
      if (!best || entry.points > best.points) best = entry
    }
    if (best) leaders.add(best.body.id)
  }

  for (const entry of shown) {
    entry.body.motionR = radiusFor(entry.body, leaders.has(entry.body.id))
    const body = entry.body
    if (body.dying > 0 || body.hp <= 0) {
      body.motion = 'defeated'
      body.vx = 0
      body.vy = 0
      body.trail = 0
      clampBody(body)
    }
  }
  driftFromCharger(shown, step)
  for (const entry of shown) {
    if (entry.body.motion === 'defeated') continue
    steer(entry, step, time, reduced, leaders.has(entry.body.id), mood, shown)
  }
  separate(shown)
  for (const entry of shown) {
    if (entry.body.motion === 'defeated') continue
    advance(entry, step)
  }
  for (const entry of shown) clampBody(entry.body)
  for (const entry of entries) if (entry.body.shown === 0) clampBody(entry.body)
  return hidden
}

function assignVisible(entries: MotionEntry[]): MotionEntry[] {
  const shown: MotionEntry[] = []
  for (const team of ['red', 'blue'] as const) {
    const side = entries.filter((entry) => entry.body.team === team && entry.body.dying <= 0 && entry.body.hp > 0)
    side.sort((a, b) => {
      const fresh = (b.fresh ? 1 : 0) - (a.fresh ? 1 : 0)
      if (fresh !== 0) return fresh
      const real = (b.real ? 1 : 0) - (a.real ? 1 : 0)
      if (real !== 0) return real
      const pose = (b.body.poseMode > 0 ? 1 : 0) - (a.body.poseMode > 0 ? 1 : 0)
      if (pose !== 0) return pose
      if (b.points !== a.points) return b.points - a.points
      return a.username.localeCompare(b.username)
    })
    const keep = new Set(side.slice(0, VISIBLE_CAP).map((entry) => entry.body.id))
    for (const entry of entries) {
      if (entry.body.team !== team) continue
      const visible = keep.has(entry.body.id) ? 1 : 0
      entry.body.shown = entry.body.dying > 0 ? 0 : visible
      if (visible === 1) shown.push(entry)
    }
  }
  return shown
}

function steer(entry: MotionEntry, dt: number, time: number, reduced: boolean, leader: boolean, mood: MotionMood, shown: MotionEntry[]): void {
  const body = entry.body
  body.cheer = Math.max(0, body.cheer - dt)
  body.stun = Math.max(0, body.stun - dt)
  if (mood.settled) {
    body.ultPhase = 0
    body.vx *= Math.exp(-dt * 14)
    body.vy *= Math.exp(-dt * 14)
    body.trail = 0
    return
  }
  if ((body.ultPhase || 0) > 0) {
    steerUltimate(body, dt)
    return
  }
  if (body.poseMode === 2) body.lunge = Math.max(body.lunge, 0.45)
  else body.lunge = Math.max(0, body.lunge - dt)
  const state = pickState(body)
  body.motion = state
  if (state === 'defeated') {
    body.vx = 0
    body.vy = 0
    body.trail = 0
    return
  }

  const box = teamBox(body.team, false, body.motionR)
  const mates = teammates(shown, body)
  const cruise = (body.speed >= 20 ? body.speed : 34) * ROAM_SPEED * (leader ? 0.92 : 1) * (reduced ? 0.45 : 1) * (state === 'stunned' ? 0.55 : 1) * (mood.finalTen && mood.lead === body.team ? 1.12 : 1) * (mood.settled ? 0.22 : 1)
  ensureTarget(body, box, mates)
  const px = body.x * DESIGN_WIDTH
  const py = body.y * DESIGN_HEIGHT
  let tx = body.aimX * DESIGN_WIDTH
  let ty = body.aimY * DESIGN_HEIGHT
  let dx = tx - px
  let dy = ty - py
  let dist = Math.hypot(dx, dy)
  const arrive = Math.max(22, body.motionR * 0.42)
  body.goalWait -= dt
  if (body.goalSerial === 0 || body.goalWait <= 0 || dist < arrive) {
    const goal = retarget(body, box, mates)
    tx = goal.x
    ty = goal.y
    dx = tx - px
    dy = ty - py
    dist = Math.hypot(dx, dy)
  }

  const nx = dist > 0.001 ? dx / dist : 1
  const ny = dist > 0.001 ? dy / dist : 0
  const ease = dist < arrive ? 0.35 + 0.4 * (dist / arrive) : 1
  const omega = 0.55 + (body.persona % 7) * 0.12
  const swayScale = dist < arrive ? 0.2 : 1
  const sway = Math.sin(time * omega + body.phase) * (8 + (body.curve > 0 ? body.curve : 6)) * swayScale
  const spread = spreadFromMates(px, py, body.motionR, mates)
  let desiredVx = nx * cruise * ease - ny * sway + spread.x
  let desiredVy = ny * cruise * ease + nx * sway + spread.y
  const sign = body.team === 'red' ? 1 : -1
  if (body.poseMode === 2) desiredVx += sign * 32
  else if (body.poseMode === 3) desiredVx -= sign * 24

  const accel = (155 + (body.persona % 5) * 18) * (reduced ? 0.65 : 1)
  let dvx = desiredVx - body.vx
  let dvy = desiredVy - body.vy
  const dv = Math.hypot(dvx, dvy)
  const maxDelta = accel * dt
  if (dv > maxDelta && dv > 0) {
    dvx = (dvx / dv) * maxDelta
    dvy = (dvy / dv) * maxDelta
  }
  body.vx += dvx
  body.vy += dvy

  const margin = Math.max(24, body.motionR * 0.28)
  const turn = 240 * dt
  if (px < box.x0 + margin) body.vx += turn * ((box.x0 + margin - px) / margin)
  if (px > box.x1 - margin) body.vx -= turn * ((px - (box.x1 - margin)) / margin)
  if (py < box.y0 + margin) body.vy += turn * ((box.y0 + margin - py) / margin)
  if (py > box.y1 - margin) body.vy -= turn * ((py - (box.y1 - margin)) / margin)
  limitSpeed(body, cruise * 1.22)

  if (state === 'hit' && body.kick !== 2) {
    body.vx += body.flinchX * 70
    body.vy += body.flinchY * 42
    body.kick = 2
    limitSpeed(body, cruise * 1.45)
  } else if (state === 'celebrate' && body.kick !== 3) {
    body.lift = Math.max(body.lift, 0.65)
    body.spin = Math.min(1.1, body.spin + 0.35)
    body.kick = 3
  } else if (state !== 'hit' && state !== 'celebrate') {
    body.kick = 0
  }
  if (state === 'celebrate') body.spin = Math.min(1.15, body.spin + dt * 1.6)
}

function steerUltimate(body: PlayerBody, dt: number): void {
  const phase = body.ultPhase || 0
  body.motion = phase === 1 ? 'charge' : phase === 4 ? 'recoil' : 'attack'
  const sign = body.team === 'red' ? 1 : -1
  const leanTarget = sign * (phase === 4 ? 0.04 : 0.18)
  body.lean += (leanTarget - body.lean) * Math.min(1, dt * 8)
  body.trail = motionReduced() ? 0 : clamp(body.ultTrail || 0, 0, 1)
  if (phase === 3 && (body.ultMove === 1 || body.ultMove === 2)) {
    body.vx *= 0.45
    body.vy *= 0.45
    return
  }
  if (phase === 1 || (phase === 3 && body.ultMove === 0)) {
    body.vx *= Math.exp(-dt * 8)
    body.vy *= Math.exp(-dt * 8)
    return
  }
  const speed = (body.speed >= 20 ? body.speed : 34) * (body.ultSpeed || 1)
  const tx = (phase === 4 ? body.ultHomeX : body.ultStrikeX) * DESIGN_WIDTH
  const ty = (phase === 4 ? body.ultHomeY : body.ultStrikeY) * DESIGN_HEIGHT
  seek(body, tx, ty, speed, dt)
}

function seek(body: PlayerBody, tx: number, ty: number, speed: number, dt: number): void {
  const px = body.x * DESIGN_WIDTH
  const py = body.y * DESIGN_HEIGHT
  const dx = tx - px
  const dy = ty - py
  const dist = Math.hypot(dx, dy)
  if (dist < 6) {
    body.vx *= 0.82
    body.vy *= 0.82
    return
  }
  const pace = Math.min(speed, dist / Math.max(0.016, dt))
  body.vx += ((dx / dist) * pace - body.vx) * Math.min(1, dt * 12)
  body.vy += ((dy / dist) * pace - body.vy) * Math.min(1, dt * 12)
  limitSpeed(body, pace)
}

function advance(entry: MotionEntry, dt: number): void {
  const body = entry.body
  if (body.ultPhase === 3 && (body.ultMove === 1 || body.ultMove === 2)) {
    const blend = clamp(body.ultDash || 0, 0, 1)
    const nx = body.ultHomeX + (body.ultStrikeX - body.ultHomeX) * blend
    const ny = body.ultHomeY + (body.ultStrikeY - body.ultHomeY) * blend
    const prevX = body.x
    const prevY = body.y
    body.x = nx
    body.y = ny
    const step = Math.max(0.016, dt)
    body.vx = ((nx - prevX) * DESIGN_WIDTH) / step
    body.vy = ((ny - prevY) * DESIGN_HEIGHT) / step
    body.trail = motionReduced() ? 0 : 1
    pushEcho(body)
    return
  }
  const box = teamBox(body.team, false, body.motionR)
  let px = body.x * DESIGN_WIDTH + body.vx * dt
  let py = body.y * DESIGN_HEIGHT + body.vy * dt
  const clampedX = clamp(px, box.x0, box.x1)
  const clampedY = clamp(py, box.y0, box.y1)
  if (clampedX !== px && (px - clampedX) * body.vx > 0) body.vx = 0
  if (clampedY !== py && (py - clampedY) * body.vy > 0) body.vy = 0
  px = clampedX
  py = clampedY
  body.x = px / DESIGN_WIDTH
  body.y = py / DESIGN_HEIGHT
  const pace = Math.hypot(body.vx, body.vy)
  body.trail = motionReduced() ? 0 : clamp((pace - 22) / 90, 0, 1)
  body.lean += (clamp(body.vx / 240, -0.16, 0.16) - body.lean) * Math.min(1, dt * 6)
  pushEcho(body)
}

function limitSpeed(body: PlayerBody, max: number): void {
  const pace = Math.hypot(body.vx, body.vy)
  if (pace > max && pace > 0) {
    body.vx *= max / pace
    body.vy *= max / pace
  }
}

function pickState(body: PlayerBody): PlayerMotionState {
  if (body.dying > 0 || body.hp <= 0) return 'defeated'
  if (body.poseMode === 1) return 'charge'
  if (body.poseMode === 2 || body.lunge > 0) return 'attack'
  if (body.poseMode === 3) return 'recoil'
  if (body.cheer > 0.05 && body.flinch < 0.35) return 'celebrate'
  if (body.stun > 0 && body.flinch < 0.55) return 'stunned'
  if (body.flinch > 0.35) return 'hit'
  return 'wander'
}

function ensureTarget(body: PlayerBody, box: Box, mates: Point[]): void {
  const tx = body.aimX * DESIGN_WIDTH
  const ty = body.aimY * DESIGN_HEIGHT
  if (body.goalSerial === 0 || tx < box.x0 || tx > box.x1 || ty < box.y0 || ty > box.y1) retarget(body, box, mates)
}

function retarget(body: PlayerBody, box: Box, mates: Point[]): { x: number; y: number } {
  body.goalSerial += 1
  const goal = pickGoal(body, box, mates)
  body.aimX = goal.x / DESIGN_WIDTH
  body.aimY = goal.y / DESIGN_HEIGHT
  const seed = hashString(`${body.id}:${body.goalSerial}:leg`)
  const travel = Math.hypot(goal.x - body.x * DESIGN_WIDTH, goal.y - body.y * DESIGN_HEIGHT)
  const pace = Math.max(56, (body.speed >= 20 ? body.speed : 34) * ROAM_SPEED)
  const dwell = 0.15 + (seed % 20) / 100
  body.goalWait = Math.min(6.5, travel / pace + dwell)
  return goal
}

interface Point {
  x: number
  y: number
  r: number
}

function teammates(shown: MotionEntry[], body: PlayerBody): Point[] {
  const mates: Point[] = []
  for (const other of shown) {
    if (other.body.id === body.id || other.body.team !== body.team) continue
    mates.push({ x: other.body.x * DESIGN_WIDTH, y: other.body.y * DESIGN_HEIGHT, r: other.body.motionR })
  }
  return mates
}

function spreadFromMates(px: number, py: number, radius: number, mates: Point[]): Point {
  let sx = 0
  let sy = 0
  for (const mate of mates) {
    let dx = px - mate.x
    let dy = py - mate.y
    let dist = Math.hypot(dx, dy)
    const comfort = Math.min(210, (radius + mate.r) * 1.62 + 42)
    if (dist >= comfort) continue
    if (dist < 0.001) {
      dx = ((hashString(`${px}:${py}`) % 7) - 3) || 1
      dy = ((hashString(`${py}:${px}`) % 5) - 2) || 1
      dist = Math.hypot(dx, dy)
    }
    const closeness = (comfort - dist) / comfort
    const mag = 26 + 96 * closeness * closeness
    sx += (dx / dist) * mag
    sy += (dy / dist) * mag
  }
  const scale = Math.hypot(sx, sy)
  if (scale > 78 && scale > 0) {
    sx = (sx / scale) * 78
    sy = (sy / scale) * 78
  }
  return { x: sx, y: sy, r: 0 }
}

function territory(x0: number, y0: number, spanX: number, spanY: number): Box {
  return { x0, x1: x0 + spanX, y0, y1: y0 + spanY }
}

function pickGoal(body: PlayerBody, box: Box, mates: Point[]): { x: number; y: number } {
  const width = Math.max(1, box.x1 - box.x0)
  const height = Math.max(1, box.y1 - box.y0)
  const padX = Math.min(16, width * 0.035)
  const padY = Math.min(16, height * 0.035)
  const x0 = box.x0 + padX
  const x1 = box.x1 - padX
  const y0 = box.y0 + padY
  const y1 = box.y1 - padY
  const spanX = Math.max(1, x1 - x0)
  const spanY = Math.max(1, y1 - y0)
  const zone = territory(x0, y0, spanX, spanY)
  const zoneW = Math.max(1, zone.x1 - zone.x0)
  const zoneH = Math.max(1, zone.y1 - zone.y0)
  const px = body.x * DESIGN_WIDTH
  const py = body.y * DESIGN_HEIGHT
  const minTravel = Math.max(200, Math.min(spanX, spanY) * 0.62)
  let best = { x: clamp((zone.x0 + zone.x1) / 2, x0, x1), y: clamp((zone.y0 + zone.y1) / 2, y0, y1) }
  let bestScore = -1
  let nearestBest = best
  let nearestScore = -1
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const x = zone.x0 + Math.random() * zoneW
    const y = zone.y0 + Math.random() * zoneH
    const travel = Math.hypot(x - px, y - py)
    let nearest = Math.min(spanX, spanY)
    for (const mate of mates) nearest = Math.min(nearest, Math.hypot(x - mate.x, y - mate.y))
    const score = nearest * 0.85 + Math.min(travel, minTravel * 1.7) * 1.15
    if (score > nearestScore) {
      nearestScore = score
      nearestBest = { x, y }
    }
    if (travel < minTravel * 0.55) continue
    if (score > bestScore) {
      bestScore = score
      best = { x, y }
    }
  }
  return bestScore >= 0 ? best : nearestBest
}

function separate(shown: MotionEntry[]): void {
  const buckets = new Map<string, PlayerBody[]>()
  for (const entry of shown) {
    const body = entry.body
    const px = body.x * DESIGN_WIDTH
    const py = body.y * DESIGN_HEIGHT
    const key = `${body.team}:${Math.floor(px / CELL)}:${Math.floor(py / CELL)}`
    const list = buckets.get(key)
    if (list) list.push(body)
    else buckets.set(key, [body])
  }
  const seen = new Set<string>()
  for (const [key, list] of buckets) {
    const [team, cx, cy] = key.split(':')
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        const other = buckets.get(`${team}:${Number(cx) + ox}:${Number(cy) + oy}`)
        if (!other) continue
        for (const a of list) {
          for (const b of other) {
            if (a.id >= b.id) continue
            const pair = `${a.id}|${b.id}`
            if (seen.has(pair)) continue
            seen.add(pair)
            const ax = a.x * DESIGN_WIDTH
            const ay = a.y * DESIGN_HEIGHT
            const bx = b.x * DESIGN_WIDTH
            const by = b.y * DESIGN_HEIGHT
            let dx = bx - ax
            let dy = by - ay
            let dist = Math.hypot(dx, dy)
            const touch = a.motionR + b.motionR + 14
            if (dist >= touch) continue
            if (dist < 0.001) {
              dx = ((hashString(a.id) % 7) - 3) || 1
              dy = ((hashString(b.id) % 5) - 2) || 1
              dist = Math.hypot(dx, dy)
            }
            const nx = dx / dist
            const ny = dy / dist
            const slide = Math.min(2.4, (touch - dist) * 0.11)
            a.x -= (nx * slide) / DESIGN_WIDTH
            a.y -= (ny * slide) / DESIGN_HEIGHT
            b.x += (nx * slide) / DESIGN_WIDTH
            b.y += (ny * slide) / DESIGN_HEIGHT
          }
        }
      }
    }
  }
}

function pushEcho(body: PlayerBody): void {
  if (!body.echoX || !body.echoY) {
    body.echoX = []
    body.echoY = []
  }
  const hot = (body.ultTrail || 0) > 0.2 || (body.trail || 0) > 0.55
  if (!hot || motionReduced()) {
    if (body.echoX.length > 0) {
      body.echoX.shift()
      body.echoY.shift()
    }
    return
  }
  body.echoX.push(body.x)
  body.echoY.push(body.y)
  if (body.echoX.length > 5) {
    body.echoX.shift()
    body.echoY.shift()
  }
}

function clampBody(body: PlayerBody): void {
  const radius = Math.max(12, body.motionR || AVATAR_BASE / 2)
  if (body.ultPhase === 3 && body.ultMove === 1) {
    const yBox = teamBox(body.team, false, radius)
    const px = clamp(body.x * DESIGN_WIDTH, EDGE_PAD + radius, DESIGN_WIDTH - EDGE_PAD - radius)
    const py = clamp(body.y * DESIGN_HEIGHT, yBox.y0, yBox.y1)
    body.x = px / DESIGN_WIDTH
    body.y = py / DESIGN_HEIGHT
    return
  }
  const box = teamBox(body.team, false, radius)
  body.x = clamp(body.x * DESIGN_WIDTH, box.x0, box.x1) / DESIGN_WIDTH
  body.y = clamp(body.y * DESIGN_HEIGHT, box.y0, box.y1) / DESIGN_HEIGHT
  if (body.aimX !== 0 || body.aimY !== 0) {
    body.aimX = clamp(body.aimX * DESIGN_WIDTH, box.x0, box.x1) / DESIGN_WIDTH
    body.aimY = clamp(body.aimY * DESIGN_HEIGHT, box.y0, box.y1) / DESIGN_HEIGHT
  }
}

function radiusFor(body: PlayerBody, leader: boolean): number {
  return permanentAvatarDiameter(body.power, leader || body.crown > 0) / 2
}

export function driftFromCharger(shown: MotionEntry[], dt = 1 / 60): void {
  for (const team of ['red', 'blue'] as const) {
    const charger = shown.find((entry) => entry.body.team === team && ((entry.body.poseMode >= 1 && entry.body.posePeak > 1.25) || ((entry.body.ultPhase || 0) >= 1 && (entry.body.ultScale || 1) > 1.25)))
    if (!charger) continue
    const cx = charger.body.x * DESIGN_WIDTH
    const cy = charger.body.y * DESIGN_HEIGHT
    for (const entry of shown) {
      if (entry.body.team !== team || entry.body.id === charger.body.id) continue
      if (entry.body.motion === 'defeated') continue
      const dx = entry.body.x * DESIGN_WIDTH - cx
      const dy = entry.body.y * DESIGN_HEIGHT - cy
      const dist = Math.hypot(dx, dy) || 1
      if (dist > 180) continue
      const box = teamBox(team, false, entry.body.motionR)
      const push = 26 * dt
      const nx = entry.body.aimX * DESIGN_WIDTH + (dx / dist) * push
      const ny = entry.body.aimY * DESIGN_HEIGHT + (dy / dist) * push
      entry.body.aimX = clamp(nx, box.x0, box.x1) / DESIGN_WIDTH
      entry.body.aimY = clamp(ny, box.y0, box.y1) / DESIGN_HEIGHT
    }
  }
}
