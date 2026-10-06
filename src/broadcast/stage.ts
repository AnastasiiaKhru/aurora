import type { AttackStyle } from '../game/attacks/style.ts'
import { styles } from '../game/attacks/style.ts'

export const DESIGN_WIDTH = 1080
export const DESIGN_HEIGHT = 1920

export const TOP_SAFE_ZONE = 260
export const GAMEPLAY_START = 260
export const GAMEPLAY_END = 1250
export const BOTTOM_SAFE_ZONE = 670
export const MIN_PLAYER_Y = 650
export const MAX_PLAYER_Y = 1200
export const MIN_ATTACK_Y = 620
export const MAX_ATTACK_Y = 1240
export const MAX_IMPACT_Y = 1250

export function stageY(px: number, height: number): number {
  return (px / DESIGN_HEIGHT) * height
}

export function isCaptureMode(): boolean {
  if (typeof window === 'undefined') return false
  const value = new URLSearchParams(window.location.search).get('capture')
  return value === 'true' || value === '1'
}

/** Backing-store scale for the battle canvas. Capped so a 1080×1920 capture stays sharp without a 3× buffer. */
export function renderResolution(): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return Math.min(2, Math.max(1, dpr))
}

let fittedCapture = ''

export function fitCaptureWindow(): void {
  if (typeof window === 'undefined' || !isCaptureMode() || !window.opener) return
  if (Math.abs(window.innerWidth - DESIGN_WIDTH) <= 1 && Math.abs(window.innerHeight - DESIGN_HEIGHT) <= 1) return
  const extraX = Math.max(0, window.outerWidth - window.innerWidth)
  const extraY = Math.max(0, window.outerHeight - window.innerHeight)
  const width = DESIGN_WIDTH + extraX
  const height = DESIGN_HEIGHT + extraY
  const key = `${width}x${height}`
  if (fittedCapture === key) return
  fittedCapture = key
  window.resizeTo(width, height)
}

export const AVATAR_BASE = 82
export const AVATAR_MAX = 125
export const AVATAR_LEADER = 155

const ATTACK_CAP = {
  micro: 80,
  small: 140,
  medium: 220,
  large: 340,
  legendary: DESIGN_WIDTH * 0.7,
} as const

/** Largest drawn span of each tier, in multiples of the attack unit. */
const ATTACK_EXTENT = {
  micro: 22,
  small: 42,
  medium: 112,
  large: 124,
  legendary: 136,
} as const

export function broadcastScale(width = window.innerWidth, height = window.innerHeight): number {
  return Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT)
}

export function permanentAvatarDiameter(power: number, leader: boolean): number {
  const cap = leader ? AVATAR_LEADER : AVATAR_MAX
  const growth = (Math.max(0, power) / 0.32) * (cap - AVATAR_BASE)
  return Math.min(AVATAR_BASE + growth, cap)
}

export function clampedAttackScale(poseScale: number, power: number, peak: number): number {
  const rest = 1 + Math.max(0, power)
  const raw = (poseScale > 0 ? poseScale : rest) / rest
  const cap = peak > 1.4 ? 2.32 : 1.65
  return Math.min(cap, Math.max(0.92, raw))
}

export function attackDrawUnit(style: AttackStyle, stageHeight: number): number {
  const tier = styles[style].tier
  const designed = Math.max(1, stageHeight / 760)
  return Math.min(designed, ATTACK_CAP[tier] / ATTACK_EXTENT[tier])
}

let captureWindow: Window | null = null

export function captureWindowOpen(): boolean {
  return captureWindow != null && !captureWindow.closed
}

export function openCaptureWindow(): void {
  if (captureWindow && !captureWindow.closed) {
    captureWindow.focus()
    return
  }
  captureWindow = window.open(
    '/battle?capture=1',
    'tiktokBattle',
    `popup=yes,width=${DESIGN_WIDTH},height=${DESIGN_HEIGHT},left=0,top=0,resizable=yes`,
  )
  captureWindow?.focus()
}
