import { useEffect, useState } from 'react'
import { formatAudioTime, type MusicStatus } from '../audio/MusicController.ts'
import { director } from '../systems/GameDirector.ts'

const EMPTY: MusicStatus = director.sound.background.status()

export function MusicStatusIndicator() {
  const [status, setStatus] = useState<MusicStatus>(EMPTY)

  useEffect(() => {
    const pull = () => setStatus(director.sound.background.status())
    pull()
    const timer = window.setInterval(pull, 400)
    return () => window.clearInterval(timer)
  }, [])

  const label = statusLabel(status)

  return (
    <div className="music-status-dock">
      <div className={`music-status-pill ${status.state === 'playing' ? 'on' : ''}`}>
        <span />
        <strong>{label}</strong>
        <em>
          {formatAudioTime(status.currentTime)} / {formatAudioTime(status.duration)}
        </em>
      </div>
      {status.duplicateBattle && (
        <p className="music-warning">More than one battle tab is sending audio. Close the extra tab so the stream does not double the music.</p>
      )}
      {status.blocked && !status.duplicateBattle && (
        <p className="music-warning">Playback stayed off so another tab is not doubled in the stream.</p>
      )}
    </div>
  )
}

function statusLabel(status: MusicStatus): string {
  if (!status.unlocked) return 'Audio locked'
  if (status.loading) return 'Loading music'
  if (status.missing) return 'Music file missing'
  if (status.state === 'playing') return status.muted ? 'Music muted' : 'Music playing'
  if (status.state === 'paused') return 'Music paused'
  if (status.streamElsewhere) return 'Stream is on the battle tab'
  if (!status.enabled) return 'Music off'
  return 'Music idle'
}
