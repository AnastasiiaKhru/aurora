import type { ComboCallout } from '../types/Battle.ts'
import { comboMark } from '../systems/ComboSystem.ts'

export function ComboDisplay({ combos }: { combos: ComboCallout[] }) {
  if (combos.length === 0) return null
  return (
    <div className="combos" aria-live="polite">
      {combos.map((combo) => (
        <div key={combo.id} className={`combo team-${combo.team} tier-${tier(combo.count)}`}>
          <span className="combo-mark">{comboMark(combo.count)}</span>
          <strong>{combo.count}×</strong>
          <em>{combo.giftName}</em>
        </div>
      ))}
    </div>
  )
}

function tier(count: number): string {
  if (count >= 100) return '100'
  if (count >= 50) return '50'
  if (count >= 25) return '25'
  if (count >= 10) return '10'
  return 'low'
}
