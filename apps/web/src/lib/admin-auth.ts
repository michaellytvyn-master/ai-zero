import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { db } from '../db'
import { loginAttempts } from '../db/schema'

const COOKIE = 'zca_admin'
const SESSION_HOURS = 8
const CAPTCHA_MINUTES = 10
const MAX_ATTEMPTS_PER_MINUTE = 5

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_USERNAME?.trim() && process.env.ADMIN_PASSWORD?.trim())
}

function secret(): string {
  const value = process.env.AUTH_SECRET
  if (value === undefined || value.length === 0) throw new Error('AUTH_SECRET is required')
  return value
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** Compares without leaking length or position through timing. */
function matches(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// ---- credentials ----

export function credentialsMatch(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USERNAME ?? ''
  const expectedPass = process.env.ADMIN_PASSWORD ?? ''
  // Both are always compared, so a wrong username does not answer faster than a
  // wrong password and reveal which half was right.
  const userOk = matches(username, expectedUser)
  const passOk = matches(password, expectedPass)
  return userOk && passOk && expectedUser.length > 0 && expectedPass.length > 0
}

// ---- an improvised captcha ----

export interface Challenge {
  readonly question: string
  /** Carries the expected answer signed, so the server keeps no state. */
  readonly token: string
}

export function makeChallenge(): Challenge {
  const a = randomInt(2, 9)
  const b = randomInt(2, 9)
  const expiresAt = Date.now() + CAPTCHA_MINUTES * 60_000
  const payload = `${a + b}.${expiresAt}`
  return { question: `${a} + ${b}`, token: `${payload}.${sign(payload)}` }
}

export function challengePassed(token: string, answer: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [expected, expiresAt, signature] = parts as [string, string, string]

  if (!matches(sign(`${expected}.${expiresAt}`), signature)) return false
  if (Number(expiresAt) < Date.now()) return false
  return answer.trim() === expected
}

// ---- throttling ----

export async function tooManyAttempts(key: string): Promise<boolean> {
  const claimed = await db().execute(sql`
    insert into ${loginAttempts} (key, minute, count)
    values (${key}, date_trunc('minute', now()), 1)
    on conflict (key, minute) do update
      set count = ${loginAttempts}.count + 1
      where ${loginAttempts}.count < ${MAX_ATTEMPTS_PER_MINUTE}
    returning count
  `)
  return claimed.rows[0] === undefined
}

export async function purgeOldLoginAttempts(): Promise<number> {
  const result = await db().execute(
    sql`delete from ${loginAttempts} where minute < now() - interval '1 hour'`,
  )
  return result.rowCount ?? 0
}

// ---- session ----

export async function startAdminSession(): Promise<void> {
  const expiresAt = Date.now() + SESSION_HOURS * 3_600_000
  const store = await cookies()
  store.set(COOKIE, `${expiresAt}.${sign(String(expiresAt))}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: SESSION_HOURS * 3600,
  })
}

export async function endAdminSession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE)
}

export async function isAdminSignedIn(): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value
  if (value === undefined) return false

  const [expiresAt, signature] = value.split('.') as [string?, string?]
  if (expiresAt === undefined || signature === undefined) return false
  if (!matches(sign(expiresAt), signature)) return false
  return Number(expiresAt) > Date.now()
}
