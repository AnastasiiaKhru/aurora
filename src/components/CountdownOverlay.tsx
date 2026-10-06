import type { HudSnapshot } from '../types/Battle.ts'

export function CountdownOverlay({ countdown }: { countdown: HudSnapshot['countdown'] }) {
  if (!countdown) return null
  const fight = countdown.label === 'FIGHT' || countdown.label === 'BATTLE'
  const next = countdown.label === 'NEXT'
  const figure = next ? 'NEW BATTLE' : countdown.label === 'BATTLE' ? 'BATTLE!' : countdown.label === 'FIGHT' ? 'FIGHT!' : countdown.label
  return (
    <div className={`count-overlay level-${countdown.level}${fight ? ' fight' : ''}${next ? ' word' : ''}`} key={countdown.token}>
      <div className="count-shock" />
      <div className="count-shock late" />
      {fight && (
        <>
          <div className="count-side red" />
          <div className="count-side blue" />
          <div className="count-flash" />
          {SPARKS.map((spark) => (
            <i key={spark} className="count-spark" style={{ ['--i' as string]: spark }} />
          ))}
        </>
      )}
      <div className="count-figure">{figure}</div>
    </div>
  )
}

const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
