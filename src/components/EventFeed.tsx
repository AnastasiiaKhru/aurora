import type { BattleFeedItem } from '../types/Events.ts'

export function EventFeed({ items }: { items: BattleFeedItem[] }) {
  return (
    <section className="feed" aria-live="polite" aria-label="Battle activity">
      {items.map((item) => (
        <div key={item.id} className={`feed-item tone-${item.tone}`}>
          {item.text}
        </div>
      ))}
    </section>
  )
}
