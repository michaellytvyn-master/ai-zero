export interface Turn {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  provider?: string | null
  model?: string | null
  /** Set instead of content when this turn is a generated picture. */
  image?: { url: string; expiresAt: string; model: string } | null
}

export function appendToLast(turns: Turn[], chunk: string): Turn[] {
  const last = turns[turns.length - 1]
  if (last === undefined) return turns
  return [...turns.slice(0, -1), { ...last, content: last.content + chunk }]
}

export function replaceLast(turns: Turn[], content: string): Turn[] {
  const last = turns[turns.length - 1]
  if (last === undefined) return turns
  return [...turns.slice(0, -1), { ...last, content }]
}
