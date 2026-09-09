import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

const DATABASE_URL = process.env.TEST_DATABASE_URL
const describeDb = DATABASE_URL === undefined ? describe.skip : describe

process.env.DATABASE_URL = DATABASE_URL ?? 'postgres://localhost/unused'
process.env.AUTH_SECRET ??= 'test-secret'
process.env.KEY_ENCRYPTION_KEY ??= Buffer.alloc(32, 13).toString('base64')

const { db } = await import('../db')
const { users } = await import('../db/schema')
const { claimRequestSlot, purgeOldRequestWindows, requestsPerMinute, tooManyRequests } =
  await import('./rate-limit')

const created: string[] = []

async function makeUser(): Promise<string> {
  const id = randomUUID()
  await db()
    .insert(users)
    .values({ id, email: `${id}@rate.local` })
  created.push(id)
  return id
}

afterAll(async () => {
  for (const id of created) await db().delete(users).where(eq(users.id, id))
})

describeDb('claimRequestSlot', () => {
  it('allows up to the limit and then stops', async () => {
    const userId = await makeUser()

    for (let i = 0; i < 5; i += 1) {
      expect((await claimRequestSlot(userId, 5)).allowed, `request ${i + 1}`).toBe(true)
    }
    expect((await claimRequestSlot(userId, 5)).allowed).toBe(false)
  })

  /**
   * The reason this is an atomic upsert rather than read-then-write: a burst is
   * exactly what a runaway client sends, and that is the case it must hold for.
   */
  it('holds the line against a simultaneous burst', async () => {
    const userId = await makeUser()

    const results = await Promise.all(
      Array.from({ length: 40 }, () => claimRequestSlot(userId, 10)),
    )

    expect(results.filter((result) => result.allowed)).toHaveLength(10)
  })

  it('counts each account separately', async () => {
    const busy = await makeUser()
    const quiet = await makeUser()
    await Promise.all(Array.from({ length: 6 }, () => claimRequestSlot(busy, 3)))

    expect((await claimRequestSlot(quiet, 3)).allowed).toBe(true)
  })

  it('reports what is left and when to retry', async () => {
    const userId = await makeUser()
    const first = await claimRequestSlot(userId, 3)

    expect(first.remaining).toBe(2)
    expect(first.limit).toBe(3)
    expect(first.retryAfter).toBeGreaterThan(0)
    expect(first.retryAfter).toBeLessThanOrEqual(60)
  })

  it('sweeps windows that have long since passed', async () => {
    const userId = await makeUser()
    await claimRequestSlot(userId, 5)

    // The current minute is not old enough to sweep, so it must survive.
    await purgeOldRequestWindows()
    expect((await claimRequestSlot(userId, 5)).remaining).toBe(3)
  })
})

describe('the configured ceiling', () => {
  it('defaults to something a person cannot reach but a script can', () => {
    expect(requestsPerMinute()).toBeGreaterThanOrEqual(30)
  })

  it('answers a refusal with 429 and a retry-after header', () => {
    const response = tooManyRequests({ allowed: false, limit: 60, remaining: 0, retryAfter: 12 })

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('12')
  })
})
