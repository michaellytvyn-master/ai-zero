import { and, asc, desc, eq, lt, sql } from 'drizzle-orm'
import { db } from '../db'
import { conversations, messages } from '../db/schema'
import { zcaConversations, zcaMessages } from '../db/user-schema'
import {
  CONVERSATION_PAGE,
  type ConversationPage,
  type ConversationSummary,
  type StoredMessage,
  titleFrom,
} from './conversations'
import { decryptedKeys } from './provider-keys'
import { userDatabaseUnavailableResponse } from './responses'
import { type UserDatabase, UserDatabaseError, userDatabase } from './user-database'

/**
 * The id a user's database address is stored under, in the same encrypted
 * vault as their model keys. Not a model provider, so it never moves anyone
 * off the shared model pool and never reaches the extension.
 */
export const DATABASE_KEY_ID = 'database'

/**
 * How much history the operator's database keeps for someone who has not
 * connected their own: the newest twenty messages, across all conversations.
 * Enough to try it; not somewhere to live.
 */
export const TRIAL_HISTORY_MESSAGES = 20

export interface NewMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly providerId?: string | null
  readonly model?: string | null
}

/** Where one user's conversations live. Every call is scoped to that user. */
export interface ContentStore {
  /** 'trial' is the operator's database, capped; 'own' is the user's. */
  readonly kind: 'trial' | 'own'
  list(before?: Date): Promise<ConversationPage>
  /** Null when the conversation does not exist or is not this user's. */
  load(
    conversationId: string,
  ): Promise<{ summary: ConversationSummary; messages: StoredMessage[] } | null>
  create(firstMessage: string): Promise<string>
  /** Refuses — returns false — when the conversation is not this user's. */
  append(conversationId: string, message: NewMessage): Promise<boolean>
  remove(conversationId: string): Promise<void>
}

export async function contentStoreFor(userId: string): Promise<ContentStore> {
  const address = (await decryptedKeys(userId)).get(DATABASE_KEY_ID)
  if (address === undefined) return trialStore(userId)
  // Deliberately no fallback to the trial store when the user's database is
  // down: that would quietly put their conversations in ours.
  return ownStore(userId, await userDatabase(address))
}

/**
 * Runs a route against the user's store, and answers 503 with a readable
 * message when their own database cannot be reached — rather than a 500, and
 * rather than writing the conversation somewhere else.
 */
export async function withContentStore(
  userId: string,
  run: (store: ContentStore) => Promise<Response>,
): Promise<Response> {
  try {
    return await run(await contentStoreFor(userId))
  } catch (error) {
    if (error instanceof UserDatabaseError)
      return userDatabaseUnavailableResponse(error.userMessage)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Trial: the operator's database, the newest TRIAL_HISTORY_MESSAGES only.
// ---------------------------------------------------------------------------

export function trialStore(userId: string): ContentStore {
  return {
    kind: 'trial',

    async list(before) {
      const rows = await db()
        .select({
          id: conversations.id,
          title: conversations.title,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(
          before === undefined
            ? eq(conversations.userId, userId)
            : and(eq(conversations.userId, userId), lt(conversations.updatedAt, before)),
        )
        .orderBy(desc(conversations.updatedAt))
        .limit(CONVERSATION_PAGE + 1)
      return page(rows)
    },

    async load(conversationId) {
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
    },

    async create(firstMessage) {
      const rows = await db()
        .insert(conversations)
        .values({ userId, title: titleFrom(firstMessage) })
        .returning({ id: conversations.id })
      const id = rows[0]?.id
      if (id === undefined) throw new Error('failed to create conversation')
      return id
    },

    async append(conversationId, message) {
      // Ownership and the timestamp in one statement: no row, not theirs.
      const touched = await db()
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
        .returning({ id: conversations.id })
      if (touched.length === 0) return false

      await db()
        .insert(messages)
        .values({
          conversationId,
          role: message.role,
          content: message.content,
          providerId: message.providerId ?? null,
          model: message.model ?? null,
        })
      await trimTrialHistory(userId, conversationId)
      return true
    },

    async remove(conversationId) {
      await db()
        .delete(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    },
  }
}

/**
 * Keeps the newest messages and drops the rest, then drops any conversation
 * left empty — except the one being written to, which is never empty for
 * long. Rolling rather than refusing, so a trial never stops working; it only
 * forgets.
 */
export async function trimTrialHistory(userId: string, keepConversation: string): Promise<void> {
  await db().execute(sql`
    delete from ${messages} where ${messages.id} in (
      select m.id from ${messages} m
      join ${conversations} c on c.id = m.conversation_id
      where c.user_id = ${userId}
      order by m.created_at desc, m.id desc
      offset ${TRIAL_HISTORY_MESSAGES}
    )
  `)
  await db().execute(sql`
    delete from ${conversations} c
    where c.user_id = ${userId}
      and c.id <> ${keepConversation}
      and not exists (select 1 from ${messages} m where m.conversation_id = c.id)
  `)
}

// ---------------------------------------------------------------------------
// Own: the user's database, unlimited, theirs.
// ---------------------------------------------------------------------------

export function ownStore(userId: string, userDb: UserDatabase): ContentStore {
  return {
    kind: 'own',

    list: (before) =>
      guarded(async () => {
        const rows = await userDb
          .select({
            id: zcaConversations.id,
            title: zcaConversations.title,
            updatedAt: zcaConversations.updatedAt,
          })
          .from(zcaConversations)
          .where(
            before === undefined
              ? eq(zcaConversations.userId, userId)
              : and(eq(zcaConversations.userId, userId), lt(zcaConversations.updatedAt, before)),
          )
          .orderBy(desc(zcaConversations.updatedAt))
          .limit(CONVERSATION_PAGE + 1)
        return page(rows)
      }),

    load: (conversationId) =>
      guarded(async () => {
        const rows = await userDb
          .select({
            id: zcaConversations.id,
            title: zcaConversations.title,
            updatedAt: zcaConversations.updatedAt,
          })
          .from(zcaConversations)
          .where(and(eq(zcaConversations.id, conversationId), eq(zcaConversations.userId, userId)))
          .limit(1)
        const summary = rows[0]
        if (summary === undefined) return null
        const history = await userDb
          .select({
            id: zcaMessages.id,
            role: zcaMessages.role,
            content: zcaMessages.content,
            providerId: zcaMessages.providerId,
            model: zcaMessages.model,
            createdAt: zcaMessages.createdAt,
          })
          .from(zcaMessages)
          .where(eq(zcaMessages.conversationId, conversationId))
          .orderBy(asc(zcaMessages.createdAt))
        return { summary, messages: history }
      }),

    create: (firstMessage) =>
      guarded(async () => {
        const rows = await userDb
          .insert(zcaConversations)
          .values({ userId, title: titleFrom(firstMessage) })
          .returning({ id: zcaConversations.id })
        const id = rows[0]?.id
        if (id === undefined) throw new Error('failed to create conversation')
        return id
      }),

    append: (conversationId, message) =>
      guarded(async () => {
        const touched = await userDb
          .update(zcaConversations)
          .set({ updatedAt: new Date() })
          .where(and(eq(zcaConversations.id, conversationId), eq(zcaConversations.userId, userId)))
          .returning({ id: zcaConversations.id })
        if (touched.length === 0) return false
        await userDb.insert(zcaMessages).values({
          conversationId,
          role: message.role,
          content: message.content,
          providerId: message.providerId ?? null,
          model: message.model ?? null,
        })
        return true
      }),

    remove: (conversationId) =>
      guarded(async () => {
        await userDb
          .delete(zcaConversations)
          .where(and(eq(zcaConversations.id, conversationId), eq(zcaConversations.userId, userId)))
      }),
  }
}

/**
 * Turns a driver error into one the routes know how to show. The raw error can
 * name hosts and roles, and is not for the user's screen.
 */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof UserDatabaseError) throw error
    throw new UserDatabaseError(
      'Your database could not be reached, so nothing was saved. Check it is running, or reconnect it in Settings.',
    )
  }
}

function page(rows: ConversationSummary[]): ConversationPage {
  const items = rows.slice(0, CONVERSATION_PAGE)
  const more = rows.length > CONVERSATION_PAGE
  return {
    items,
    nextCursor: more ? (items[items.length - 1]?.updatedAt.toISOString() ?? null) : null,
  }
}
