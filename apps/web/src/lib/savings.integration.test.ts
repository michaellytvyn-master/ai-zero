import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

const DATABASE_URL = process.env.TEST_DATABASE_URL
const describeDb = DATABASE_URL === undefined ? describe.skip : describe

process.env.DATABASE_URL = DATABASE_URL ?? 'postgres://localhost/unused'
process.env.AUTH_SECRET ??= 'test-secret'
process.env.AUTH_GOOGLE_ID ??= 'test-id'
process.env.AUTH_GOOGLE_SECRET ??= 'test-secret'
process.env.KEY_ENCRYPTION_KEY ??= Buffer.alloc(32, 5).toString('base64')

const { referenceModel, savingsFrom } = await import('@zca/pricing')
const { db } = await import('../db')
const { users } = await import('../db/schema')
const { recordUsage } = await import('./usage')
const { usageTotalsForUser } = await import('./savings')

const created: string[] = []

async function makeUser(): Promise<string> {
  const id = randomUUID()
  await db()
    .insert(users)
    .values({ id, email: `${id}@test.local` })
  created.push(id)
  return id
}

async function record(
  userId: string,
  providerId: string,
  inputTokens: number,
  outputTokens: number,
  status = 200,
): Promise<void> {
  await recordUsage(userId, {
    providerId,
    model: 'test-model',
    inputTokens,
    outputTokens,
    latencyMs: 100,
    status,
    at: new Date().toISOString(),
    source: 'router',
    keyOwner: 'user',
  })
}

afterAll(async () => {
  for (const id of created) await db().delete(users).where(eq(users.id, id))
})

describeDb('savings from recorded usage', () => {
  it('groups by provider and matches the hand-computed figure', async () => {
    const userId = await makeUser()
    await record(userId, 'groq', 1000, 500)
    await record(userId, 'groq', 1000, 500)
    await record(userId, 'mistral', 2000, 1000)

    const savings = savingsFrom(await usageTotalsForUser(userId), referenceModel('gpt-5-mini'))

    // groq: 2000 in, 1000 out -> 2000*0.25 + 1000*2.00 = 2500 micro-dollars
    // mistral: 2000 in, 1000 out -> the same 2500
    expect(savings.byProvider.map((row) => row.microUsd)).toEqual([2500, 2500])
    expect(savings.microUsd).toBe(5000)
    expect(savings.requests).toBe(3)
  })

  it('leaves failed requests out of both the cost and the request count', async () => {
    const userId = await makeUser()
    await record(userId, 'groq', 1000, 500)
    await record(userId, 'groq', 0, 0, 429)
    await record(userId, 'groq', 0, 0, 500)

    const savings = savingsFrom(await usageTotalsForUser(userId), referenceModel('gpt-5-mini'))

    expect(savings.requests).toBe(1)
    expect(savings.microUsd).toBe(1250)
  })

  it('shows one user nothing of another user usage', async () => {
    const busy = await makeUser()
    const quiet = await makeUser()
    await record(busy, 'groq', 5000, 5000)

    const theirs = savingsFrom(await usageTotalsForUser(quiet), referenceModel())
    expect(theirs.microUsd).toBe(0)
    expect(theirs.requests).toBe(0)
  })

  it('rises with a more expensive reference model on identical usage', async () => {
    const userId = await makeUser()
    await record(userId, 'groq', 1_000_000, 1_000_000)

    const totals = await usageTotalsForUser(userId)
    const mini = savingsFrom(totals, referenceModel('gpt-5-mini')).microUsd
    const flagship = savingsFrom(totals, referenceModel('gpt-5.5')).microUsd

    expect(mini).toBe(2_250_000)
    expect(flagship).toBe(35_000_000)
  })
})
