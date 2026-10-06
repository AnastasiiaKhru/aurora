export function paintNpcIcon(kind: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const maple = kind.includes('maple')
  const glow = ctx.createRadialGradient(128, 118, 20, 128, 128, 120)
  glow.addColorStop(0, maple ? '#ffe7a3' : '#f4f8ff')
  glow.addColorStop(0.45, maple ? '#ff4d4d' : '#6aa4ff')
  glow.addColorStop(1, maple ? '#7a1024' : '#102454')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(128, 128, 120, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = maple ? '#ffd56a' : '#d5e6ff'
  ctx.lineWidth = 10
  ctx.stroke()
  ctx.save()
  ctx.translate(128, 132)
  ctx.fillStyle = maple ? '#fff4d2' : '#f7fbff'
  ctx.strokeStyle = maple ? '#c45100' : '#d7e4ff'
  ctx.lineWidth = 6
  if (maple) paintLeaf(ctx)
  else paintStar(ctx, 0, -6, 78, 5)
  ctx.restore()
  ctx.fillStyle = maple ? '#4a1020' : '#102040'
  ctx.beginPath()
  ctx.arc(108, 124, 7, 0, Math.PI * 2)
  ctx.arc(148, 124, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = maple ? '#4a1020' : '#102040'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(128, 142, 16, 0.15, Math.PI - 0.15)
  ctx.stroke()
  return canvas
}

function paintLeaf(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath()
  ctx.moveTo(0, -78)
  for (let lobe = 0; lobe < 5; lobe += 1) {
    const angle = -Math.PI / 2 + (lobe - 2) * 0.62
    ctx.quadraticCurveTo(Math.cos(angle) * 36, Math.sin(angle) * 36 - 10, Math.cos(angle) * 70, Math.sin(angle) * 70)
    ctx.quadraticCurveTo(Math.cos(angle) * 20, Math.sin(angle) * 48, 0, 8)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillRect(-4, 8, 8, 36)
}

function paintStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, points: number): void {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? size : size * 0.42
    const angle = -Math.PI / 2 + (i * Math.PI) / points
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}
