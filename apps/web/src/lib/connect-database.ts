import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { conversations, messages } from '../db/schema'
import { zcaConversations, zcaMessages } from '../db/user-schema'
import { DATABASE_KEY_ID } from './content-store'
import { decryptedKeys, deleteProviderKey, saveProviderKey } from './provider-keys'
import {
  type UserDatabase,
  describeDatabase,
  forgetUserDatabase,
  prepareUserDatabase,
  userDatabase,
} from './user-database'

/**
 * Connecting a user's own database, in an order where a failure at any step
 * loses nothing and a retry duplicates nothing:
 *
 *   1. prepare   — connect, check, create the tables. Nothing of theirs moves.
 *   2. copy      — trial history into their database, keeping its ids, so a
 *                  second attempt skips what the first already wrote.
 *   3. save      — the encrypted address; from here their database is used.
 *   4. clear     — the trial copy in ours. If this one fails the history is in
 *                  both places for a while, which is harmless: ours is no
 *                  longer read, and the next trial trim would drop it anyway.
 */
export async function connectUserDatabase(
  userId: string,
  url: string,
): Promise<{ where: string; moved: number }> {
  await prepareUserDatabase(url)
  const moved = await copyTrialHistory(userId, await userDatabase(url))

  const previous = (await decryptedKeys(userId)).get(DATABASE_KEY_ID)
  await saveProviderKey(userId, DATABASE_KEY_ID, url, describeDatabase(url))
  if (previous !== undefined && previous !== url) await forgetUserDatabase(previous)

  await db().delete(conversations).where(eq(conversations.userId, userId))
  return { where: describeDatabase(url), moved }
}

/**
 * Stops using the user's database. Nothing in it is touched — it is theirs,
 * and so is the decision to empty it. New chats go back to the trial.
 */
export async function disconnectUserDatabase(userId: string): Promise<void> {
  const current = (await decryptedKeys(userId)).get(DATABASE_KEY_ID)
  await deleteProviderKey(userId, DATABASE_KEY_ID)
  if (current !== undefined) await forgetUserDatabase(current)
}

export async function connectedDatabase(userId: string): Promise<string | null> {
  const current = (await decryptedKeys(userId)).get(DATABASE_KEY_ID)
  return current === undefined ? null : describeDatabase(current)
}

/** Returns how many messages were copied. At most the trial's twenty. */
export async function copyTrialHistory(userId: string, userDb: UserDatabase): Promise<number> {
  const trial = await db().select().from(conversations).where(eq(conversations.userId, userId))
  if (trial.length === 0) return 0
  const trialMessages = await db()
    .select()
    .from(messages)
    .where(
      inArray(
        messages.conversationId,
        trial.map((conversation) => conversation.id),
      ),
    )

  await userDb.transaction(async (tx) => {
    await tx
      .insert(zcaConversations)
      .values(
        trial.map((conversation) => ({
          id: conversation.id,
          userId,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        })),
      )
      .onConflictDoNothing()
    if (trialMessages.length > 0) {
      await tx
        .insert(zcaMessages)
        .values(
          trialMessages.map((message) => ({
            id: message.id,
            conversationId: message.conversationId,
            role: message.role,
            content: message.content,
            providerId: message.providerId,
            model: message.model,
            createdAt: message.createdAt,
          })),
        )
        .onConflictDoNothing()
    }
  })
  return trialMessages.length
}
