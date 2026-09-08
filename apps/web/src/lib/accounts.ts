import { eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'
import { assertUsablePassword, hashPassword, verifyPassword } from './password'

export class EmailTakenError extends Error {}

export interface AccountUser {
  readonly id: string
  readonly email: string
  readonly name: string | null
  readonly image: string | null
}

const normalise = (email: string): string => email.trim().toLowerCase()

export async function registerWithPassword(
  email: string,
  password: string,
  name: string | null,
): Promise<AccountUser> {
  assertUsablePassword(password)
  const address = normalise(email)

  const existing = await findByEmail(address)
  if (existing !== null) throw new EmailTakenError('That email already has an account.')

  const rows = await db()
    .insert(users)
    .values({ email: address, name, passwordHash: await hashPassword(password) })
    .returning({ id: users.id, email: users.email, name: users.name, image: users.image })

  const created = rows[0]
  if (created === undefined) throw new Error('failed to create the account')
  return created
}

/**
 * Returns null for a wrong password, a missing account, and an account that
 * only has Google — the caller must not be able to tell which, or this becomes
 * a way to enumerate who has registered.
 */
export async function authenticate(email: string, password: string): Promise<AccountUser | null> {
  const found = await findByEmail(normalise(email))

  if (found?.passwordHash == null) {
    // Spend comparable time on an unknown address so response time does not
    // leak whether the account exists.
    await verifyPassword(password, DECOY_HASH)
    return null
  }

  if (!(await verifyPassword(password, found.passwordHash))) return null
  return { id: found.id, email: found.email, name: found.name, image: found.image }
}

export async function changePassword(
  userId: string,
  current: string,
  next: string,
): Promise<boolean> {
  assertUsablePassword(next)
  const rows = await db()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const existing = rows[0]?.passwordHash
  // An account created through Google has no password yet, so there is nothing
  // to confirm and setting one is the first step, not a change.
  if (existing != null && !(await verifyPassword(current, existing))) return false

  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, userId))
  return true
}

export async function hasPassword(userId: string): Promise<boolean> {
  const rows = await db()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return rows[0]?.passwordHash != null
}

async function findByEmail(address: string) {
  const rows = await db()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${address}`)
    .limit(1)
  return rows[0] ?? null
}

/** A real scrypt envelope over a value nobody knows, for the timing decoy. */
const DECOY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
