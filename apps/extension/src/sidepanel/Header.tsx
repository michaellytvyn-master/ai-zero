import { formatUsd, type Savings } from '@zca/pricing'
import { SITE_URL } from '@/lib/config'
import type { Session } from '@/lib/session'

export default function Header(props: {
  session: Session
  ownKeys: boolean
  provider: string | null
  savings: Savings | null
  tabTitle: string | null
  onNewChat: () => void
  onToggleSavings: () => void
  onSignOut: () => void
  onClose: () => void
}) {
  return (
    <>
      <header>
        <span className={props.ownKeys ? 'badge live' : 'badge'}>
          {props.ownKeys ? 'your keys' : `${props.session.demo?.remaining ?? 0} left today`}
        </span>
        {props.provider !== null && <span className="badge">via {props.provider}</span>}
        {props.session.stale && <span className="badge">offline</span>}
        {props.savings !== null && (
          <button type="button" className="badge" onClick={props.onToggleSavings}>
            saved {formatUsd(props.savings.microUsd)}
          </button>
        )}

        <span className="spacer" />
        <button type="button" className="icon" onClick={props.onNewChat} title="New chat">
          ✎
        </button>
        <button type="button" className="icon" onClick={props.onClose} title="Close on this tab">
          ✕
        </button>
      </header>

      {props.tabTitle !== null && props.tabTitle.length > 0 && (
        <div className="tabline" title={props.tabTitle}>
          <span className="dot" />
          <span className="name">{props.tabTitle}</span>
          <span className="spacer" />
          <a href={`${SITE_URL}/dashboard/keys`} target="_blank" rel="noreferrer">
            Keys
          </a>
          <button type="button" className="linklike" onClick={props.onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </>
  )
}
