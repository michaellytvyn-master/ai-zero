export interface Turn {
  id: string
  role: 'user' | 'assistant'
  content: string
  answeredBy?: string
  /** The model's working-out. Shown collapsed, and never sent back as history. */
  reasoning?: string
}

export const newTurn = (role: Turn['role'], content: string): Turn => ({
  id: crypto.randomUUID(),
  role,
  content,
})
