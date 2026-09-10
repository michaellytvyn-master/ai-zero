export interface Turn {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  provider?: string | null
  model?: string | null
  /** Set instead of content when this turn is a generated picture. */
  image?: { url: string; expiresAt: string | null; model: string } | null
  /** Pages read before answering, so the reply can be checked against them. */
  pages?: { url: string; title: string; ok: boolean; note: string }[]
  /** The model's working-out. Shown collapsed, and not part of the history. */
  reasoning?: string
}

export function appendToLast(turns: Turn[], chunk: string): Turn[] {
  const last = turns[turns.length - 1]
  if (last === undefined) return turns
  return [...turns.slice(0, -1), { ...last, content: last.content + chunk }]
}

export function appendReasoningToLast(turns: Turn[], chunk: string): Turn[] {
  const last = turns[turns.length - 1]
  if (last === undefined) return turns
  return [...turns.slice(0, -1), { ...last, reasoning: (last.reasoning ?? '') + chunk }]
}

export function replaceLast(turns: Turn[], content: string): Turn[] {
  const last = turns[turns.length - 1]
  if (last === undefined) return turns
  return [...turns.slice(0, -1), { ...last, content }]
}
