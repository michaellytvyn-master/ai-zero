import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

const DATABASE_URL = process.env.TEST_DATABASE_URL
const describeDb = DATABASE_URL === undefined ? describe.skip : describe

process.env.DATABASE_URL = DATABASE_URL ?? 'postgres://localhost/unused'
process.env.AUTH_SECRET ??= 'test-secret'
process.env.KEY_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64')

const { db } = await import('../db')
const { users } = await import('../db/schema')
const { EmailTakenError, authenticate, changePassword, hasPassword, registerWithPassword } =
  await import('./accounts')
const { WeakPasswordError } = await import('./password')

const PASSWORD = 'a-long-enough-password'
const emails: string[] = []

function freshEmail(): string {
  const email = `acct-${randomUUID()}@test.local`
  emails.push(email)
  return email
}

afterAll(async () => {
  for (const email of emails) {
    await db().delete(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
  }
})

describeDb('registerWithPassword', () => {
  it('creates an account that can then sign in', async () => {
    const email = freshEmail()
    const created = await registerWithPassword(email, PASSWORD, 'Test Person')

    expect(created.email).toBe(email)
    expect((await authenticate(email, PASSWORD))?.id).toBe(created.id)
  })

  it('stores a hash, never the password', async () => {
    const email = freshEmail()
    const created = await registerWithPassword(email, PASSWORD, null)

    const rows = await db()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, created.id))

    expect(rows[0]?.passwordHash).not.toContain(PASSWORD)
    expect(rows[0]?.passwordHash).toMatch(/^scrypt\$/)
  })

  it('treats the address case-insensitively, both ways', async () => {
    const email = freshEmail()
    await registerWithPassword(email.toUpperCase(), PASSWORD, null)

    expect(await authenticate(email.toLowerCase(), PASSWORD)).not.toBeNull()
    await expect(registerWithPassword(email, PASSWORD, null)).rejects.toThrow(EmailTakenError)
  })

  it('refuses a password too short to protect anything', async () => {
    await expect(registerWithPassword(freshEmail(), 'short', null)).rejects.toThrow(
      WeakPasswordError,
    )
  })
})

describeDb('authenticate', () => {
  it('rejects the wrong password', async () => {
    const email = freshEmail()
    await registerWithPassword(email, PASSWORD, null)

    expect(await authenticate(email, 'not-the-password')).toBeNull()
  })

  it('rejects an unknown address without saying it is unknown', async () => {
    expect(await authenticate('nobody-at-all@test.local', PASSWORD)).toBeNull()
  })

  it('rejects an account that only has Google, rather than letting any password in', async () => {
    const email = freshEmail()
    await db().insert(users).values({ email, passwordHash: null })

    expect(await authenticate(email, PASSWORD)).toBeNull()
    expect(await authenticate(email, '')).toBeNull()
  })
})

describeDb('changePassword', () => {
  it('requires the current password and then accepts the new one', async () => {
    const email = freshEmail()
    const user = await registerWithPassword(email, PASSWORD, null)

    expect(await changePassword(user.id, 'wrong-current-one', 'brand-new-password')).toBe(false)
    expect(await authenticate(email, PASSWORD)).not.toBeNull()

    expect(await changePassword(user.id, PASSWORD, 'brand-new-password')).toBe(true)
    expect(await authenticate(email, PASSWORD)).toBeNull()
    expect(await authenticate(email, 'brand-new-password')).not.toBeNull()
  })

  it('lets a Google-only account set its first password with no current one', async () => {
    const email = freshEmail()
    const rows = await db()
      .insert(users)
      .values({ email, passwordHash: null })
      .returning({ id: users.id })
    const id = rows[0]?.id as string

    expect(await hasPassword(id)).toBe(false)
    expect(await changePassword(id, '', 'a-first-real-password')).toBe(true)
    expect(await hasPassword(id)).toBe(true)
    expect(await authenticate(email, 'a-first-real-password')).not.toBeNull()
  })

  it('refuses to replace a good password with a weak one', async () => {
    const email = freshEmail()
    const user = await registerWithPassword(email, PASSWORD, null)

    await expect(changePassword(user.id, PASSWORD, 'weak')).rejects.toThrow(WeakPasswordError)
    expect(await authenticate(email, PASSWORD)).not.toBeNull()
  })
})
