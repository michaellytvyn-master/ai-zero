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
}) {
  return (
    <>
      {props.tabTitle !== null && props.tabTitle.length > 0 && (
        <div className="tabline" title={props.tabTitle}>
          chat for: {props.tabTitle}
        </div>
      )}
      <header>
        <span className="badge">
          {props.ownKeys ? 'your keys' : `demo ${props.session.demo?.remaining ?? 0} left`}
        </span>
        {props.provider !== null && <span className="badge">via {props.provider}</span>}
        {props.session.stale && <span className="badge">offline</span>}
        {props.savings !== null && (
          <button
            type="button"
            className="badge"
            style={{ padding: '2px 7px', cursor: 'pointer' }}
            onClick={props.onToggleSavings}
          >
            saved {formatUsd(props.savings.microUsd)}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="linklike" onClick={props.onNewChat}>
          New chat
        </button>
        <a href={`${SITE_URL}/dashboard/keys`} target="_blank" rel="noreferrer">
          Keys
        </a>
        <button type="button" className="linklike" onClick={props.onSignOut}>
          Sign out
        </button>
      </header>
    </>
  )
}
