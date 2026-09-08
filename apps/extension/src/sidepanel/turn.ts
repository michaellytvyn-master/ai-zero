export interface Turn {
  id: string
  role: 'user' | 'assistant'
  content: string
  answeredBy?: string
}

export const newTurn = (role: Turn['role'], content: string): Turn => ({
  id: crypto.randomUUID(),
  role,
  content,
})
