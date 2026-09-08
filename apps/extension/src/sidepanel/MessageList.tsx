import type { RefObject } from 'react'
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
          This chat belongs to the tab you are on. Switch tabs and you get a separate one; come back
          and this is still here. To ask about the page itself, change &ldquo;Do not read the
          page&rdquo; below.
        </p>
      )}
      {props.turns.map((turn) => (
        <div key={turn.id} className={`turn ${turn.role}`}>
          <div className="who">
            {turn.role}
            {turn.answeredBy != null && ` · ${turn.answeredBy}`}
          </div>
          {turn.content || (props.busy && turn.content === '' ? '…' : '')}
        </div>
      ))}
    </div>
  )
}
