export function HelpActions() {
  return (
    <aside className="power-menu help-actions" aria-label="How to help your team">
      <div className="help-row">
        <span className="help-like">
          <i className="help-badge" aria-hidden="true">♥</i>
          <span className="help-copy">
            <strong>LIKE</strong>
            <em>BLAST</em>
          </span>
        </span>
        <span className="help-share">
          <i className="help-badge" aria-hidden="true">↗</i>
          <span className="help-copy">
            <strong>SHARE</strong>
            <em>POWER</em>
          </span>
        </span>
        <span className="help-follow">
          <i className="help-badge" aria-hidden="true">＋</i>
          <span className="help-copy">
            <strong>FOLLOW</strong>
            <em>BOOST</em>
          </span>
        </span>
      </div>
    </aside>
  )
}

export function JoinPrompt() {
  return (
    <p className="join-banner join-instruction">
      COMMENT <b className="cmd-c">C</b> OR <b className="cmd-u">U</b> TO JOIN
    </p>
  )
}
