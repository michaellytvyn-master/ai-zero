import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db'
import { extensionSessions, users } from '../db/schema'

export interface ExtensionUser {
  readonly id: string
  readonly email: string
}

/**
 * Only the hash is stored, so a database dump does not yield working bearer
 * tokens. The plaintext is returned once, to the authorize page, and never
 * again.
 */
export async function issueExtensionToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await db()
    .insert(extensionSessions)
    .values({ userId, tokenHash: hash(token) })
  return token
}

export async function userForExtensionToken(token: string): Promise<ExtensionUser | null> {
  const rows = await db()
    .select({ id: users.id, email: users.email, sessionId: extensionSessions.id })
    .from(extensionSessions)
    .innerJoin(users, eq(users.id, extensionSessions.userId))
    .where(
      and(
        eq(extensionSessions.tokenHash, hash(token)),
        isNull(extensionSessions.revokedAt),
        gt(extensionSessions.expiresAt, new Date()),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null

  await db()
    .update(extensionSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(extensionSessions.id, row.sessionId))

  return { id: row.id, email: row.email }
}

export async function revokeExtensionToken(token: string): Promise<void> {
  await db()
    .update(extensionSessions)
    .set({ revokedAt: new Date() })
    .where(eq(extensionSessions.tokenHash, hash(token)))
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header === null) return null
  const [scheme, value] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || value === undefined) return null
  return value.trim() || null
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
