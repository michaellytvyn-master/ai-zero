import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DATABASE_URL = process.env.TEST_DATABASE_URL
const describeDb = DATABASE_URL === undefined ? describe.skip : describe

process.env.DATABASE_URL = DATABASE_URL ?? 'postgres://localhost/unused'
process.env.AUTH_SECRET ??= 'test-secret'
process.env.AUTH_GOOGLE_ID ??= 'test-id'
process.env.AUTH_GOOGLE_SECRET ??= 'test-secret'
process.env.KEY_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64')
process.env.DEMO_MESSAGES_PER_ACCOUNT_PER_DAY ??= '10'

const { db } = await import('../db')
const { providerKeys, users } = await import('../db/schema')
const { decryptedKeys, listProviderKeys, saveProviderKey, deleteProviderKey } = await import(
  './provider-keys'
)
const { claimDemoMessage, demoRemaining, recordUsage } = await import('./usage')
const { appendMessage, createConversation, loadConversation, listConversations } = await import(
  './conversations'
)
const { userRows, providerRows } = await import('./admin')
const { PostgresCooldownStore } = await import('./cooldowns')

const SECRET = 'gsk_realLookingKeyThatMustStayHidden999'
const created: string[] = []

async function makeUser(): Promise<string> {
  const id = randomUUID()
  await db()
    .insert(users)
    .values({ id, email: `${id}@test.local` })
  created.push(id)
  return id
}

beforeAll(async () => {
  if (DATABASE_URL !== undefined) await db().execute(sql`select 1`)
})

afterAll(async () => {
  for (const id of created) await db().delete(users).where(eq(users.id, id))
})

describeDb('provider key vault', () => {
  it('stores the key encrypted and hands it back decrypted', async () => {
    const userId = await makeUser()
    await saveProviderKey(userId, 'groq', SECRET)

    const stored = await db()
      .select({ secret: providerKeys.secret, hint: providerKeys.hint })
      .from(providerKeys)
      .where(eq(providerKeys.userId, userId))

    expect(stored[0]?.secret).not.toContain(SECRET)
    expect(stored[0]?.secret).not.toContain('gsk_')
    expect(stored[0]?.hint).toBe('n999')
    expect((await decryptedKeys(userId)).get('groq')).toBe(SECRET)
  })

  it('never exposes the secret through the account listing', async () => {
    const userId = await makeUser()
    await saveProviderKey(userId, 'groq', SECRET)

    expect(JSON.stringify(await listProviderKeys(userId))).not.toContain(SECRET)
  })

  it('replaces a key on re-save rather than duplicating it', async () => {
    const userId = await makeUser()
    await saveProviderKey(userId, 'groq', SECRET)
    await saveProviderKey(userId, 'groq', 'gsk_theReplacementKey1234')

    const keys = await listProviderKeys(userId)
    expect(keys).toHaveLength(1)
    expect((await decryptedKeys(userId)).get('groq')).toBe('gsk_theReplacementKey1234')
  })

  it('forgets a deleted key', async () => {
    const userId = await makeUser()
    await saveProviderKey(userId, 'groq', SECRET)
    await deleteProviderKey(userId, 'groq')

    expect((await decryptedKeys(userId)).size).toBe(0)
  })
})

describeDb('demo cap', () => {
  it('lets exactly the configured number of messages through, even in parallel', async () => {
    const userId = await makeUser()

    const results = await Promise.all(Array.from({ length: 25 }, () => claimDemoMessage(userId)))

    expect(results.filter((result) => result.allowed)).toHaveLength(10)
    expect((await demoRemaining(userId)).remaining).toBe(0)
  })
})

describeDb('conversations', () => {
  it('keeps one user conversation invisible to another', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()

    const conversationId = await createConversation(owner, 'a private question')
    await appendMessage(conversationId, { role: 'user', content: 'a private question' })

    expect(await loadConversation(owner, conversationId)).not.toBeNull()
    expect(await loadConversation(stranger, conversationId)).toBeNull()
    expect((await listConversations(stranger)).items).toHaveLength(0)
  })

  it('round trips a conversation and titles it from the first message', async () => {
    const userId = await makeUser()
    const conversationId = await createConversation(userId, 'how do I center a div')
    await appendMessage(conversationId, { role: 'user', content: 'how do I center a div' })
    await appendMessage(conversationId, {
      role: 'assistant',
      content: 'flexbox',
      providerId: 'groq',
      model: 'openai/gpt-oss-20b',
    })

    const loaded = await loadConversation(userId, conversationId)
    expect(loaded?.summary.title).toBe('how do I center a div')
    expect(loaded?.messages.map((m) => m.content)).toEqual(['how do I center a div', 'flexbox'])
    expect(loaded?.messages[1]?.providerId).toBe('groq')
  })
})

describeDb('admin views', () => {
  it('aggregates usage without touching message content', async () => {
    const userId = await makeUser()
    const conversationId = await createConversation(userId, 'secret topic')
    await appendMessage(conversationId, { role: 'user', content: 'a very secret question' })

    await recordUsage(userId, {
      providerId: 'groq',
      model: 'openai/gpt-oss-20b',
      inputTokens: 100,
      outputTokens: 40,
      latencyMs: 250,
      status: 200,
      at: new Date().toISOString(),
      source: 'router',
      keyOwner: 'user',
    })

    const person = (await userRows()).find((row) => row.id === userId)
    expect(person?.requests).toBe(1)
    expect(person?.inputTokens).toBe(100)
    expect(JSON.stringify(await userRows())).not.toContain('secret')
    expect(JSON.stringify(await providerRows())).not.toContain('secret')
  })
})

describeDb('cooldowns', () => {
  it('reports a provider as cooling down until the window passes', async () => {
    const store = new PostgresCooldownStore()
    const providerId = `test-${randomUUID().slice(0, 8)}`

    expect(await store.isCoolingDown(providerId)).toBe(false)
    await store.startCooldown(providerId, 60)
    expect(await store.isCoolingDown(providerId)).toBe(true)

    await store.startCooldown(providerId, -1)
    expect(await store.isCoolingDown(providerId)).toBe(false)
  })
})
