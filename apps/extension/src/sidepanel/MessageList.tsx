import type { RefObject } from 'react'
import Reasoning from './Reasoning'
import type { Turn } from './turn'

export default function MessageList(props: {
  turns: Turn[]
  busy: boolean
  logRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="log" ref={props.logRef}>
      {props.turns.length === 0 && (
        <p className="empty">
          This chat belongs to this tab and stays here. Other tabs have no panel until you open one
          there, and coming back finds this conversation where you left it. To ask about the page
          itself, switch <strong>Page</strong> below to text or HTML.
        </p>
      )}
      {props.turns.map((turn) => (
        <div key={turn.id} className={`turn ${turn.role}`}>
          <div className="who">
            {turn.role}
            {turn.answeredBy != null && ` · ${turn.answeredBy}`}
          </div>
          {turn.reasoning !== undefined && turn.reasoning.length > 0 && (
            <Reasoning text={turn.reasoning} answered={turn.content.length > 0} />
          )}
          {turn.content ||
            (props.busy && turn.content === '' && (turn.reasoning ?? '') === '' ? (
              <span className="typing" role="status" aria-label="Thinking">
                <i />
                <i />
                <i />
              </span>
            ) : (
              ''
            ))}
        </div>
      ))}
    </div>
  )
}
