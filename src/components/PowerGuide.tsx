import { useEffect, useState } from 'react'
import { useDirector } from './useDirector.ts'
import { attackHeadlines } from '../config/effectConfig.ts'
import { tiktokGifts } from '../config/tiktokGifts.ts'
import type { TikTokGift } from '../types/Gift.ts'

const PAGE_MS = 3_600
const PER_PAGE = 6

const pages: TikTokGift[][] = []
for (let i = 0; i < tiktokGifts.length; i += PER_PAGE) {
  pages.push(tiktokGifts.slice(i, i + PER_PAGE))
}

export function PowerGuide() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (pages.length < 2) return
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % pages.length)
    }, PAGE_MS)
    return () => window.clearInterval(timer)
  }, [])

  const gifts = pages[index] ?? pages[0] ?? []

  return (
    <aside className="power-menu" aria-live="polite">
      <div className="power-track" key={index}>
        {gifts.map((gift) => (
          <div key={gift.id} className="power-chip" title={attackHeadlines[gift.attackType]}>
            <GiftMark icon={gift.icon} image={gift.image} />
            <span>{coinLabel(gift.coinValue)}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

export function JoinPrompt() {
  const hud = useDirector()
  return (
    <p className="join-banner join-instruction">
      COMMENT <b className="cmd-c">C</b> OR <b className="cmd-u">U</b> TO JOIN
      {hud.attract && <span className="join-invitation">JOIN THE BATTLE</span>}
    </p>
  )
}

function coinLabel(value: number): string {
  if (value >= 1000) {
    const scaled = value / 1000
    return Number.isInteger(scaled) ? `${scaled}K` : `${scaled.toFixed(1)}K`
  }
  return String(value)
}

function GiftMark({ icon, image }: { icon: string; image?: string }) {
  if (image) return <img className="guide-gift" src={image} alt="" />
  return <span className="guide-gift fallback">{icon}</span>
}
