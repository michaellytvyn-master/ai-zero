import type { ChatEvent } from '@/lib/chat'
import type { Turn } from './turn'

export interface EventSetters {
  setTurns: React.Dispatch<React.SetStateAction<Turn[]>>
  setProvider: (value: string) => void
  setExhausted: (value: { label: string; url: string }[]) => void
  setError: (value: string) => void
}

export function applyEvent(event: ChatEvent, setters: EventSetters): void {
  if (event.kind === 'provider') {
    setters.setProvider(event.providerId)
    setters.setTurns((previous) =>
      replaceLast(previous, {
        answeredBy: `${event.providerId} · ${event.model}`,
      }),
    )
  } else if (event.kind === 'delta') {
    setters.setTurns((previous) =>
      replaceLast(previous, {
        content: (previous[previous.length - 1]?.content ?? '') + event.content,
      }),
    )
  } else if (event.kind === 'reasoning') {
    setters.setTurns((previous) =>
      replaceLast(previous, {
        reasoning: (previous[previous.length - 1]?.reasoning ?? '') + event.content,
      }),
    )
  } else if (event.kind === 'tool_call') {
    // Handled by the agent loop, which reads the stream itself. A plain chat
    // never offers tools, so nothing here should act on one.
  } else if (event.kind === 'exhausted') {
    setters.setExhausted(event.signupUrls)
    setters.setTurns((previous) => previous.slice(0, -2))
  } else {
    setters.setError(event.message)
  }
}

function replaceLast(turns: Turn[], patch: Partial<Turn>): Turn[] {
  const last = turns[turns.length - 1]
  if (last === undefined) return turns
  return [...turns.slice(0, -1), { ...last, ...patch }]
}
