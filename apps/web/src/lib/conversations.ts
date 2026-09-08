import { and, asc, desc, eq } from 'drizzle-orm'
import type { ChatMessage } from '@zca/shared'
import { db } from '../db'
import { conversations, messages } from '../db/schema'

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

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  return db()
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(100)
}

/** Returns null when the conversation belongs to somebody else. */
export async function loadConversation(
  userId: string,
  conversationId: string,
): Promise<{ summary: ConversationSummary; messages: StoredMessage[] } | null> {
  const rows = await db()
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1)

  const summary = rows[0]
  if (summary === undefined) return null

  const history = await db()
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      providerId: messages.providerId,
      model: messages.model,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))

  return { summary, messages: history }
}

export async function createConversation(userId: string, firstMessage: string): Promise<string> {
  const rows = await db()
    .insert(conversations)
    .values({ userId, title: titleFrom(firstMessage) })
    .returning({ id: conversations.id })

  const id = rows[0]?.id
  if (id === undefined) throw new Error('failed to create conversation')
  return id
}

export async function appendMessage(
  conversationId: string,
  message: {
    role: 'user' | 'assistant'
    content: string
    providerId?: string | null
    model?: string | null
  },
): Promise<void> {
  await db()
    .insert(messages)
    .values({
      conversationId,
      role: message.role,
      content: message.content,
      providerId: message.providerId ?? null,
      model: message.model ?? null,
    })
  await db()
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  await db()
    .delete(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
}

export function toChatMessages(history: readonly StoredMessage[]): ChatMessage[] {
  return history.map((message) => ({ role: message.role, content: message.content }))
}

function titleFrom(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) return 'New chat'
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned
}
