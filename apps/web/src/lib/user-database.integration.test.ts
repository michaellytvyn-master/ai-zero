import { randomUUID } from 'node:crypto'
import { userInfo } from 'node:os'
import { eq, getTableColumns, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DATABASE_URL = process.env.TEST_DATABASE_URL
const describeDb = DATABASE_URL === undefined ? describe.skip : describe

process.env.DATABASE_URL = DATABASE_URL ?? 'postgres://localhost/unused'
process.env.AUTH_SECRET ??= 'test-secret'
process.env.KEY_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64')
process.env.DEMO_MESSAGES_PER_ACCOUNT_PER_DAY ??= '20'
// The user's "own" database here is a second database on the local server:
// private and unencrypted, which production would refuse. NODE_ENV is 'test'.
process.env.USER_DATABASE_INSECURE_LOCAL = 'true'

const { db } = await import('../db')
const { conversations, messages, users } = await import('../db/schema')
const { zcaConversations, zcaMessages } = await import('../db/user-schema')
const { TRIAL_HISTORY_MESSAGES, contentStoreFor, ownStore, trialStore } = await import(
  './content-store'
)
const { connectUserDatabase, copyTrialHistory, disconnectUserDatabase } = await import(
  './connect-database'
)
const { forgetUserDatabase, prepareUserDatabase, userDatabase } = await import('./user-database')
const { claimTrialImage, TRIAL_IMAGES_PER_DAY } = await import('./usage')
const { saveProviderKey } = await import('./provider-keys')

const created: string[] = []
const userDbName = `zca_user_${randomUUID().slice(0, 8)}`
let userUrl = ''

async function makeUser(): Promise<string> {
  const id = randomUUID()
  await db()
    .insert(users)
    .values({ id, email: `${id}@test.local` })
  created.push(id)
  return id
}

beforeAll(async () => {
  if (DATABASE_URL === undefined) return
  // A database of its own, standing in for the one a user would connect.
  await db().execute(sql.raw(`create database ${userDbName}`))
  const base = new URL(DATABASE_URL)
  const user = base.username || userInfo().username
  const password = base.password || 'unused-under-trust-auth'
  userUrl = `postgres://${user}:${password}@${base.hostname}:${base.port || 5432}/${userDbName}?sslmode=disable`
})

afterAll(async () => {
  if (DATABASE_URL === undefined) return
  await forgetUserDatabase(userUrl)
  for (const id of created) await db().delete(users).where(eq(users.id, id))
  await db().execute(sql.raw(`drop database if exists ${userDbName} with (force)`))
})

describeDb('the user’s own database', () => {
  it('is prepared with the tables the code expects, and preparing twice is harmless', async () => {
    await prepareUserDatabase(userUrl)
    await prepareUserDatabase(userUrl)

    // The DDL and the drizzle schema are written separately; this is what
    // keeps them from drifting apart.
    const userDb = await userDatabase(userUrl)
    for (const table of [zcaConversations, zcaMessages]) {
      const name = table === zcaConversations ? 'zca_conversation' : 'zca_message'
      const result = await userDb.execute(
        sql`select column_name from information_schema.columns where table_name = ${name}`,
      )
      const actual = (result.rows as { column_name: string }[]).map((row) => row.column_name).sort()
      const expected = Object.values(getTableColumns(table))
        .map((column) => column.name)
        .sort()
      expect(actual).toEqual(expected)
    }
  })

  it('keeps each account’s conversations to itself, even in a shared database', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const userDb = await userDatabase(userUrl)

    const id = await ownStore(owner, userDb).create('a private question')
    expect(await ownStore(owner, userDb).append(id, { role: 'user', content: 'hello' })).toBe(true)

    expect(await ownStore(stranger, userDb).load(id)).toBeNull()
    expect((await ownStore(stranger, userDb).list()).items).toHaveLength(0)
    expect(await ownStore(stranger, userDb).append(id, { role: 'user', content: 'x' })).toBe(false)

    const loaded = await ownStore(owner, userDb).load(id)
    expect(loaded?.messages.map((message) => message.content)).toEqual(['hello'])

    await ownStore(owner, userDb).remove(id)
    expect(await ownStore(owner, userDb).load(id)).toBeNull()
  })
})

describeDb('the trial history in the operator’s database', () => {
  it(`keeps only the newest ${TRIAL_HISTORY_MESSAGES} messages, rolling`, async () => {
    const userId = await makeUser()
    const store = trialStore(userId)

    const first = await store.create('first')
    for (let n = 0; n < 6; n++) await store.append(first, { role: 'user', content: `old ${n}` })
    const second = await store.create('second')
    for (let n = 0; n < 20; n++) await store.append(second, { role: 'user', content: `new ${n}` })

    const kept = await db()
      .select({ content: messages.content })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(eq(conversations.userId, userId))
    expect(kept).toHaveLength(TRIAL_HISTORY_MESSAGES)
    expect(kept.some((row) => row.content.startsWith('old'))).toBe(false)

    // The first conversation was emptied by the trim, so it is gone too.
    expect(await store.load(first)).toBeNull()
    expect(await store.load(second)).not.toBeNull()
  })
})

describeDb('connecting a user’s own database', () => {
  it('moves the trial history there and removes it from ours', async () => {
    const userId = await makeUser()
    const trial = trialStore(userId)
    const id = await trial.create('before connecting')
    await trial.append(id, { role: 'user', content: 'written during the trial' })

    const result = await connectUserDatabase(userId, userUrl)
    expect(result.moved).toBe(1)

    // Ours no longer holds it.
    expect(
      await db().select().from(conversations).where(eq(conversations.userId, userId)),
    ).toHaveLength(0)

    // Theirs does, and it is what the app now reads.
    const store = await contentStoreFor(userId)
    expect(store.kind).toBe('own')
    expect((await store.load(id))?.messages[0]?.content).toBe('written during the trial')
  })

  it('does not duplicate anything if the copy runs twice', async () => {
    const userId = await makeUser()
    const trial = trialStore(userId)
    const id = await trial.create('copied twice')
    await trial.append(id, { role: 'user', content: 'once' })

    await prepareUserDatabase(userUrl)
    const userDb = await userDatabase(userUrl)
    await copyTrialHistory(userId, userDb)
    await copyTrialHistory(userId, userDb)

    const rows = await userDb.select().from(zcaMessages).where(eq(zcaMessages.conversationId, id))
    expect(rows).toHaveLength(1)
  })

  it('leaves the user’s data where it is on disconnect, and goes back to the trial', async () => {
    const userId = await makeUser()
    await connectUserDatabase(userId, userUrl)
    const own = await contentStoreFor(userId)
    const id = await own.create('kept after disconnecting')

    await disconnectUserDatabase(userId)
    expect((await contentStoreFor(userId)).kind).toBe('trial')

    const userDb = await userDatabase(userUrl)
    expect(
      await userDb.select().from(zcaConversations).where(eq(zcaConversations.id, id)),
    ).toHaveLength(1)
  })

  it('never hands the database address to the extension', async () => {
    const userId = await makeUser()
    await saveProviderKey(userId, 'database', userUrl)
    const { issueExtensionToken } = await import('./extension-auth')
    const { GET } = await import('../app/api/extension/me/route')

    const token = await issueExtensionToken(userId)
    const response = await GET(
      new Request('http://localhost/api/extension/me', {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(text).not.toContain(userDbName)
    expect(text).not.toContain('postgres://')
  })
})

describeDb('the trial picture allowance', () => {
  it(`allows ${TRIAL_IMAGES_PER_DAY} a day and refuses the next`, async () => {
    const userId = await makeUser()
    for (let n = 0; n < TRIAL_IMAGES_PER_DAY; n++) {
      expect((await claimTrialImage(userId)).allowed).toBe(true)
    }
    expect((await claimTrialImage(userId)).allowed).toBe(false)
  })

  it('cannot be overrun by pictures requested at the same moment', async () => {
    const userId = await makeUser()
    const results = await Promise.all(Array.from({ length: 12 }, () => claimTrialImage(userId)))
    expect(results.filter((result) => result.allowed)).toHaveLength(TRIAL_IMAGES_PER_DAY)
  })
})
