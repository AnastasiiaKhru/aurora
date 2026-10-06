import type { LiveLinkPhase } from '../integrations/tiktok/liveMessages.ts'

export function TikTokStatus({ phase, detail }: { phase: LiveLinkPhase | 'simulator'; detail: string }) {
  const label = phase === 'live' ? 'LIVE' : phase === 'connecting' ? 'Connecting' : phase === 'simulator' ? 'Simulator' : 'Offline'
  return (
    <div className={`tiktok-status phase-${phase}`} title={detail}>
      TikTok <span /> {label}
    </div>
  )
}
