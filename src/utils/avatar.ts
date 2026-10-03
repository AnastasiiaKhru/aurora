const canvases = new Map<string, HTMLCanvasElement>()
const urls = new Map<string, string>()

export function avatarCanvas(key: string): HTMLCanvasElement | undefined {
  return canvases.get(key)
}

export function makeAvatar(initials: string, hue: number, seed: number): { key: string; url: string } {
  const key = `${seed}-${hue}-${initials}`
  const cached = urls.get(key)
  if (cached) return { key, url: cached }

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    urls.set(key, '')
    return { key, url: '' }
  }

  const style = seed % 3
  ctx.fillStyle = `hsl(${hue} 42% 22%)`
  ctx.fillRect(0, 0, 256, 256)

  for (let i = 0; i < 4; i += 1) {
    const x = (seed * (i + 3) * 47) % 256
    const y = (seed * (i + 5) * 29) % 256
    const radius = 70 + ((seed + i * 17) % 50)
    const blobHue = (hue + (style === 1 ? 18 : -12) + i * 16) % 360
    const gradient = ctx.createRadialGradient(x, y, 8, x, y, radius)
    gradient.addColorStop(0, `hsla(${blobHue} 62% ${58 + (i % 2) * 8}% / 0.92)`)
    gradient.addColorStop(1, `hsla(${blobHue} 62% 48% / 0)`)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  if (style === 2) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(128, 118, 78, 0, Math.PI * 2)
    ctx.stroke()
  }

  const sheen = ctx.createLinearGradient(0, 0, 256, 220)
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)')
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, 256, 256)

  const vignette = ctx.createRadialGradient(128, 118, 40, 128, 128, 150)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.38)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, 256, 256)

  ctx.fillStyle = 'rgba(255,248,240,0.95)'
  ctx.font = '600 92px Outfit, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials.slice(0, 2), 128, 136)

  canvases.set(key, canvas)
  const url = canvas.toDataURL('image/png')
  urls.set(key, url)
  return { key, url }
}
