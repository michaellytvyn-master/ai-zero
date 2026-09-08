import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { apiKeys, users } from '../db/schema'

/** Recognisable in logs and search, and distinct from a provider's own keys. */
const PREFIX = 'zca_'

export interface ApiKeyRow {
  readonly id: string
  readonly name: string
  readonly prefix: string
  readonly createdAt: Date
  readonly lastUsedAt: Date | null
}

export interface IssuedKey extends ApiKeyRow {
  /** Returned once, at creation. It cannot be recovered afterwards. */
  readonly secret: string
}

export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(PREFIX)
}

export async function issueApiKey(userId: string, name: string): Promise<IssuedKey> {
  const secret = `${PREFIX}${randomBytes(24).toString('base64url')}`
  const rows = await db()
    .insert(apiKeys)
    .values({
      userId,
      name: name.trim().slice(0, 60) || 'Untitled key',
      keyHash: hash(secret),
      prefix: secret.slice(0, PREFIX.length + 6),
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })

  const created = rows[0]
  if (created === undefined) throw new Error('failed to create the key')
  return { ...created, secret }
}

export async function listApiKeys(userId: string): Promise<ApiKeyRow[]> {
  return db()
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(apiKeys.createdAt)
}

/** Scoped by user as well as id, so one account cannot revoke another's. */
export async function revokeApiKey(userId: string, id: string): Promise<void> {
  await db()
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
}

export async function userForApiKey(token: string): Promise<{ id: string; email: string } | null> {
  const rows = await db()
    .select({ id: users.id, email: users.email, keyId: apiKeys.id })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(and(eq(apiKeys.keyHash, hash(token)), isNull(apiKeys.revokedAt)))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null

  await db().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.keyId))

  return { id: row.id, email: row.email }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
