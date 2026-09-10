import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db'
import { extensionSessions, users } from '../db/schema'
import { API_KEY_PREFIX } from './api-keys'

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

/**
 * chrome.identity.launchWebAuthFlow finishes at the extension's own
 * chromiumapp.org origin, so the redirect names the extension asking. Returns
 * that id, or null when the address is not one an extension could receive —
 * anything else would make the authorize page an open redirect for a token.
 */
export function extensionIdFrom(redirectUri: string | undefined): string | null {
  const match = /^https:\/\/([a-p]{32})\.chromiumapp\.org\/?$/.exec(redirectUri ?? '')
  return match?.[1] ?? null
}

/**
 * Which extensions may be handed a token. The consent page is styled as this
 * product's, so without a list any other installed extension could open it and
 * a person who pressed Allow would be connecting that one instead. Set
 * EXTENSION_IDS to the store id (and a local unpacked id, for development) and
 * only those are served. Unset, any extension may ask, and the page shows the
 * asking extension's id so it can be checked against chrome://extensions.
 */
export function extensionAllowed(id: string, configured = process.env.EXTENSION_IDS): boolean {
  const allowed = (configured ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  return allowed.length === 0 || allowed.includes(id)
}

/**
 * The only way into an endpoint that hands over plaintext provider keys.
 *
 * Not an API key: a zca_ key is scoped to calling the chat API from the user's
 * own code, and a leaked one must not be a leaked Groq key. It used to get in,
 * because the route shared resolveUser with the chat endpoints. Not a session
 * cookie either: any script running on the site's origin sends that, and only
 * the extension needs the keys in the clear.
 */
export async function extensionTokenUser(request: Request): Promise<ExtensionUser | null> {
  const token = bearerToken(request)
  if (token === null || token.startsWith(API_KEY_PREFIX)) return null
  return userForExtensionToken(token)
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

export interface ExtensionSessionRow {
  readonly id: string
  readonly createdAt: Date
  readonly lastSeenAt: Date
  readonly expiresAt: Date
}

export async function listExtensionSessions(userId: string): Promise<ExtensionSessionRow[]> {
  return db()
    .select({
      id: extensionSessions.id,
      createdAt: extensionSessions.createdAt,
      lastSeenAt: extensionSessions.lastSeenAt,
      expiresAt: extensionSessions.expiresAt,
    })
    .from(extensionSessions)
    .where(and(eq(extensionSessions.userId, userId), isNull(extensionSessions.revokedAt)))
    .orderBy(extensionSessions.lastSeenAt)
}

/** Scoped by user id as well as row id, so one account cannot revoke another's. */
export async function revokeExtensionSessionById(userId: string, id: string): Promise<void> {
  await db()
    .update(extensionSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(extensionSessions.id, id), eq(extensionSessions.userId, userId)))
}
