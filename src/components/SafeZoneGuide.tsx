import { isCaptureMode } from '../broadcast/stage.ts'

export function SafeZoneGuide({ zones, preview }: { zones: boolean; preview: boolean }) {
  if (isCaptureMode() || (!zones && !preview)) return null
  return (
    <>
      {preview && <TikTokOverlayPreview />}
      {zones && (
        <div className="safe-guides" aria-hidden="true">
          <div className="safe-top">TIKTOK HEADER SAFE ZONE</div>
          <div className="safe-play" />
          <div className="safe-bottom">TIKTOK CHAT SAFE ZONE</div>
        </div>
      )}
    </>
  )
}

function TikTokOverlayPreview() {
  return (
    <div className="tiktok-preview" aria-hidden="true">
      <div className="tt-profile">
        <span className="tt-avatar" />
        <span>
          <strong>creator</strong>
          <em>LIVE</em>
        </span>
      </div>
      <div className="tt-viewers">1.2K</div>
      <div className="tt-top-controls">
        <i />
        <i />
      </div>
      <div className="tt-notes">
        <p>alex joined Canada</p>
        <p>sam liked the LIVE</p>
        <p>mia sent Rose</p>
      </div>
      <div className="tt-chat">
        <p><b>alex</b> C</p>
        <p><b>sam</b> this battle is close</p>
        <p><b>mia</b> U</p>
        <p><b>jordan</b> go Canada</p>
      </div>
      <div className="tt-input">
        <span>Add comment...</span>
        <i />
      </div>
      <div className="tt-side">
        <span>Like</span>
        <span>Comment</span>
        <span>Share</span>
        <span>Gift</span>
      </div>
    </div>
  )
}
