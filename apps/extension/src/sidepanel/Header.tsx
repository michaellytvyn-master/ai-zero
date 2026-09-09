import { formatUsd, type Savings } from '@zca/pricing'
import { CLOSE, PLUS } from '@zca/shared'
import { SITE_URL } from '@/lib/config'
import type { Session } from '@/lib/session'
import Icon from './Icon'

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
  grouping: boolean
  onGrouping: (on: boolean) => void
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
          <Icon shape={PLUS} />
        </button>
        <button type="button" className="icon" onClick={props.onClose} title="Close on this tab">
          <Icon shape={CLOSE} />
        </button>
      </header>

      {props.tabTitle !== null && props.tabTitle.length > 0 && (
        <div className="tabline" title={props.tabTitle}>
          <span className="dot" />
          <span className="name">{props.tabTitle}</span>
          <span className="spacer" />
          <label className="toggle" title="Collect the tabs this panel is open on into a tab group">
            <input
              type="checkbox"
              checked={props.grouping}
              onChange={(event) => props.onGrouping(event.target.checked)}
            />
            Group
          </label>
          <a href={`${SITE_URL}/settings/keys`} target="_blank" rel="noreferrer">
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
