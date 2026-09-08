import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

const DATABASE_URL = process.env['TEST_DATABASE_URL']
const describeDb = DATABASE_URL === undefined ? describe.skip : describe

process.env['DATABASE_URL'] = DATABASE_URL ?? 'postgres://localhost/unused'
process.env['AUTH_SECRET'] ??= 'test-secret'
process.env['AUTH_GOOGLE_ID'] ??= 'test-id'
process.env['AUTH_GOOGLE_SECRET'] ??= 'test-secret'
process.env['KEY_ENCRYPTION_KEY'] ??= Buffer.alloc(32, 3).toString('base64')

const { db } = await import('../db')
const { extensionSessions, users } = await import('../db/schema')
const { bearerToken, issueExtensionToken, revokeExtensionToken, userForExtensionToken } =
  await import('./extension-auth')

const created: string[] = []

async function makeUser(): Promise<string> {
  const id = randomUUID()
  await db().insert(users).values({ id, email: `${id}@test.local` })
  created.push(id)
  return id
}

afterAll(async () => {
  for (const id of created) await db().delete(users).where(eq(users.id, id))
})

describeDb('extension tokens', () => {
  it('resolves a freshly issued token to its owner', async () => {
    const userId = await makeUser()
    const token = await issueExtensionToken(userId)

    expect((await userForExtensionToken(token))?.id).toBe(userId)
  })

  it('stores only a hash, so the table cannot hand out working tokens', async () => {
    const userId = await makeUser()
    const token = await issueExtensionToken(userId)

    const rows = await db()
      .select({ tokenHash: extensionSessions.tokenHash })
      .from(extensionSessions)
      .where(eq(extensionSessions.userId, userId))

    expect(rows[0]?.tokenHash).not.toBe(token)
    expect(rows[0]?.tokenHash).toHaveLength(64)
  })

  it('rejects an unknown token', async () => {
    expect(await userForExtensionToken('not-a-real-token')).toBeNull()
  })

  it('rejects a revoked token', async () => {
    const userId = await makeUser()
    const token = await issueExtensionToken(userId)
    await revokeExtensionToken(token)

    expect(await userForExtensionToken(token)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const userId = await makeUser()
    const token = await issueExtensionToken(userId)
    await db()
      .update(extensionSessions)
      .set({ expiresAt: sql`now() - interval '1 hour'` })
      .where(eq(extensionSessions.userId, userId))

    expect(await userForExtensionToken(token)).toBeNull()
  })

  it("never lets one user's token unlock another user", async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const token = await issueExtensionToken(owner)

    expect((await userForExtensionToken(token))?.id).not.toBe(stranger)
  })
})

describe('bearerToken', () => {
  const withHeader = (value: string) =>
    bearerToken(new Request('https://example.test', { headers: { authorization: value } }))

  it('reads a bearer header regardless of case', () => {
    expect(withHeader('Bearer abc123')).toBe('abc123')
    expect(withHeader('bearer abc123')).toBe('abc123')
  })

  it('ignores other schemes and empty values', () => {
    expect(withHeader('Basic abc123')).toBeNull()
    expect(withHeader('Bearer')).toBeNull()
    expect(withHeader('Bearer   ')).toBeNull()
  })

  it('is null when the header is absent', () => {
    expect(bearerToken(new Request('https://example.test'))).toBeNull()
  })
})
