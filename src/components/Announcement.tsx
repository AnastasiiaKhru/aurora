import type { Announcement as AnnouncementState } from '../types/Battle.ts'

export function Announcement({ announcement }: { announcement: AnnouncementState | null }) {
  if (!announcement) return null
  const power = announcement.rarity === 'medium' || announcement.rarity === 'large' || announcement.rarity === 'legendary'
  return (
    <div key={announcement.id} className={`announce rarity-${announcement.rarity} team-${announcement.team}`} role="status">
      {announcement.avatarUrl ? <img src={announcement.avatarUrl} alt="" /> : <span className="announce-fallback" />}
      <div>
        {power && <div className="announce-kicker">Power activated</div>}
        <div className="announce-user">@{announcement.username}</div>
        <div className="announce-title">{announcement.title}</div>
        <div className="announce-sub">{announcement.subtitle}</div>
      </div>
      <div className="announce-icon">{announcement.image ? <img src={announcement.image} alt="" /> : announcement.icon}</div>
    </div>
  )
}
