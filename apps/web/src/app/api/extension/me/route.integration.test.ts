import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

const DATABASE_URL = process.env.TEST_DATABASE_URL
const describeDb = DATABASE_URL === undefined ? describe.skip : describe

process.env.DATABASE_URL = DATABASE_URL ?? 'postgres://localhost/unused'
process.env.AUTH_SECRET ??= 'test-secret'
process.env.KEY_ENCRYPTION_KEY ??= Buffer.alloc(32, 5).toString('base64')

const { db } = await import('@/db')
const { users } = await import('@/db/schema')
const { saveProviderKey } = await import('@/lib/provider-keys')
const { issueExtensionToken } = await import('@/lib/extension-auth')
const { issueApiKey } = await import('@/lib/api-keys')
const { GET } = await import('./route')

// Deliberately not shaped like a real provider key.
const PROVIDER_KEY = 'test-provider-key-not-real-0001'
const created: string[] = []

async function userWithAKey(): Promise<string> {
  const id = randomUUID()
  await db()
    .insert(users)
    .values({ id, email: `${id}@test.local` })
  created.push(id)
  await saveProviderKey(id, 'groq', PROVIDER_KEY)
  return id
}

const call = (authorization?: string) =>
  GET(
    new Request('http://localhost/api/extension/me', {
      headers: authorization === undefined ? {} : { authorization },
    }),
  )

afterAll(async () => {
  for (const id of created) await db().delete(users).where(eq(users.id, id))
})

/**
 * This endpoint returns the user's provider keys in the clear, which is what
 * the extension's direct mode needs. It once shared its authentication with the
 * chat endpoints, so a zca_ API key — made for the user's own code — could read
 * every provider key the account held.
 */
describeDb('GET /api/extension/me', () => {
  it('gives the extension its own user’s keys', async () => {
    const userId = await userWithAKey()
    const token = await issueExtensionToken(userId)

    const response = await call(`Bearer ${token}`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { providers: { id: string; key: string | null }[] }
    expect(body.providers.find((provider) => provider.id === 'groq')?.key).toBe(PROVIDER_KEY)
  })

  it('refuses an API key, which must never unlock provider keys', async () => {
    const userId = await userWithAKey()
    const { secret } = await issueApiKey(userId, 'my script')
    // Guard against the test passing for the wrong reason: this must be a real,
    // valid API key, not an undefined that any endpoint would refuse.
    expect(secret.startsWith('zca_')).toBe(true)

    const response = await call(`Bearer ${secret}`)
    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain(PROVIDER_KEY)
  })

  it('refuses a request with no token at all', async () => {
    expect((await call()).status).toBe(401)
  })

  it('refuses a token that was never issued', async () => {
    expect((await call('Bearer not-a-real-token')).status).toBe(401)
  })
})
