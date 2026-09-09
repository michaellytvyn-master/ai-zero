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
            turn.content ||
            (busy && index === turns.length - 1 ? (
              <span className="typing" role="status" aria-label="Thinking">
                <i />
                <i />
                <i />
              </span>
            ) : (
              ''
            ))
          )}
          {turn.pages !== undefined && turn.pages.length > 0 && (
            <div className="sources">
              {turn.pages.map((page) => (
                <a
                  key={page.url}
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  className={page.ok ? '' : 'failed'}
                  title={page.note}
                >
                  {page.title || new URL(page.url).hostname}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
