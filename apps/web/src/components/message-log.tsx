interface Turn {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  provider?: string | null
  model?: string | null
}

export default function MessageLog({ turns, busy }: { turns: Turn[]; busy: boolean }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {turns.map((turn, index) => (
        <div key={turn.id} className="card" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            {turn.role}
            {turn.provider != null && ` · ${turn.provider}`}
            {turn.model != null && ` · ${turn.model}`}
          </div>
          {turn.content || (busy && index === turns.length - 1 ? '…' : '')}
        </div>
      ))}
    </div>
  )
}
