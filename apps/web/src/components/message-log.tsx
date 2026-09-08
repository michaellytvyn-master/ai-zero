import GeneratedImage from './generated-image'
import type { Turn } from './turn'

export default function MessageLog({ turns, busy }: { turns: Turn[]; busy: boolean }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {turns.map((turn, index) => (
        <div key={turn.id} className={`turn-card ${turn.role}`}>
          <div className="who">
            {turn.role}
            {turn.provider != null && ` · ${turn.provider}`}
            {turn.model != null && ` · ${turn.model}`}
          </div>
          {turn.image != null ? (
            <GeneratedImage
              url={turn.image.url}
              expiresAt={turn.image.expiresAt}
              model={turn.image.model}
            />
          ) : (
            turn.content || (busy && index === turns.length - 1 ? '…' : '')
          )}
        </div>
      ))}
    </div>
  )
}
