import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

const DATABASE_URL = process.env.TEST_DATABASE_URL
const describeDb = DATABASE_URL === undefined ? describe.skip : describe

process.env.DATABASE_URL = DATABASE_URL ?? 'postgres://localhost/unused'
process.env.AUTH_SECRET ??= 'test-secret'
process.env.KEY_ENCRYPTION_KEY ??= Buffer.alloc(32, 11).toString('base64')

const { db } = await import('../db')
const { apiKeys, users } = await import('../db/schema')
const { issueApiKey, listApiKeys, looksLikeApiKey, revokeApiKey, userForApiKey } = await import(
  './api-keys'
)

const created: string[] = []

async function makeUser(): Promise<string> {
  const id = randomUUID()
  await db()
    .insert(users)
    .values({ id, email: `${id}@apikey.local` })
  created.push(id)
  return id
}

afterAll(async () => {
  for (const id of created) await db().delete(users).where(eq(users.id, id))
})

describeDb('issuing and using a key', () => {
  it('resolves a fresh key to its owner', async () => {
    const userId = await makeUser()
    const issued = await issueApiKey(userId, 'my script')

    expect(issued.secret.startsWith('zca_')).toBe(true)
    expect((await userForApiKey(issued.secret))?.id).toBe(userId)
  })

  it('stores only a hash, so the table cannot hand out working keys', async () => {
    const userId = await makeUser()
    const issued = await issueApiKey(userId, 'k')

    const rows = await db()
      .select({ keyHash: apiKeys.keyHash, prefix: apiKeys.prefix })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))

    expect(rows[0]?.keyHash).not.toBe(issued.secret)
    expect(rows[0]?.keyHash).toHaveLength(64)
    expect(issued.secret.startsWith(rows[0]?.prefix ?? 'x')).toBe(true)
  })

  it('never returns the secret again after creation', async () => {
    const userId = await makeUser()
    const issued = await issueApiKey(userId, 'k')

    const listed = JSON.stringify(await listApiKeys(userId))
    expect(listed).not.toContain(issued.secret)
    // The prefix is meant to be there — it is how two keys are told apart.
    expect(listed).toContain(issued.prefix)
    expect(issued.prefix.length).toBeLessThan(issued.secret.length)
  })

  it('rejects an unknown key', async () => {
    expect(await userForApiKey('zca_definitely-not-real')).toBeNull()
  })

  it('rejects a revoked key', async () => {
    const userId = await makeUser()
    const issued = await issueApiKey(userId, 'k')
    await revokeApiKey(userId, issued.id)

    expect(await userForApiKey(issued.secret)).toBeNull()
    expect(await listApiKeys(userId)).toHaveLength(0)
  })

  it('will not let one account revoke another account key', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const issued = await issueApiKey(owner, 'k')

    await revokeApiKey(stranger, issued.id)

    expect((await userForApiKey(issued.secret))?.id).toBe(owner)
  })

  it('records when a key was last used', async () => {
    const userId = await makeUser()
    const issued = await issueApiKey(userId, 'k')
    expect((await listApiKeys(userId))[0]?.lastUsedAt).toBeNull()

    await userForApiKey(issued.secret)

    expect((await listApiKeys(userId))[0]?.lastUsedAt).not.toBeNull()
  })
})

describe('looksLikeApiKey', () => {
  /** Tells an API key from an extension token without a database round trip. */
  it('recognises the prefix and nothing else', () => {
    expect(looksLikeApiKey('zca_abc')).toBe(true)
    expect(looksLikeApiKey('abc')).toBe(false)
    expect(looksLikeApiKey('')).toBe(false)
    expect(looksLikeApiKey('ZCA_abc')).toBe(false)
  })
})
