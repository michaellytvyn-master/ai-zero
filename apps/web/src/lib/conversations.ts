import type { ChatMessage } from '@zca/shared'

/**
 * Shapes and helpers shared by both places a conversation can live. The
 * queries themselves are in content-store.ts: the operator's database for a
 * trial, the user's own for everything else.
 */

export interface ConversationSummary {
  readonly id: string
  readonly title: string
  readonly updatedAt: Date
}

export interface StoredMessage {
  readonly id: string
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
  readonly providerId: string | null
  readonly model: string | null
  readonly createdAt: Date
}

export const CONVERSATION_PAGE = 30

/**
 * Keyset pagination on updatedAt rather than an offset: the list reorders as
 * conversations are used, and an offset would skip or repeat rows when it does.
 */
export interface ConversationPage {
  readonly items: ConversationSummary[]
  /** Pass back as `before` for the next page; null when the list is exhausted. */
  readonly nextCursor: string | null
}

export function toChatMessages(history: readonly StoredMessage[]): ChatMessage[] {
  return history.map((message) => ({ role: message.role, content: message.content }))
}

export function titleFrom(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) return 'New chat'
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned
}
