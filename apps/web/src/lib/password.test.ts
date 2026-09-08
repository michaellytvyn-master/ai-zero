import { describe, expect, it } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  WeakPasswordError,
  assertUsablePassword,
  hashPassword,
  verifyPassword,
} from './password'

const PASSWORD = 'correct horse battery staple'

describe('hashPassword', () => {
  it('accepts the password it just hashed', async () => {
    expect(await verifyPassword(PASSWORD, await hashPassword(PASSWORD))).toBe(true)
  })

  it('never stores the password itself', async () => {
    const envelope = await hashPassword(PASSWORD)
    expect(envelope).not.toContain(PASSWORD)
    expect(envelope).not.toContain('horse')
  })

  it('salts, so the same password hashes differently every time', async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD))
  })

  it('records its parameters, so they can be raised later without locking anyone out', async () => {
    expect(await hashPassword(PASSWORD)).toMatch(/^scrypt\$32768\$8\$1\$/)
  })

  it('refuses a password too short to be worth hashing', async () => {
    await expect(hashPassword('short')).rejects.toThrow(WeakPasswordError)
    expect(() => assertUsablePassword('x'.repeat(MIN_PASSWORD_LENGTH - 1))).toThrow()
    expect(() => assertUsablePassword('x'.repeat(MIN_PASSWORD_LENGTH))).not.toThrow()
  })

  it('refuses an absurdly long password rather than burning CPU on it', async () => {
    await expect(hashPassword('x'.repeat(2000))).rejects.toThrow(WeakPasswordError)
  })
})

describe('verifyPassword', () => {
  it('rejects the wrong password', async () => {
    const envelope = await hashPassword(PASSWORD)
    expect(await verifyPassword('wrong password entirely', envelope)).toBe(false)
    expect(await verifyPassword(`${PASSWORD} `, envelope)).toBe(false)
    expect(await verifyPassword('', envelope)).toBe(false)
  })

  it('rejects a tampered hash instead of throwing', async () => {
    const envelope = await hashPassword(PASSWORD)
    const [scheme, n, r, p, salt, hash] = envelope.split('$')
    const flipped = `${hash?.slice(0, -2)}AA`
    expect(await verifyPassword(PASSWORD, [scheme, n, r, p, salt, flipped].join('$'))).toBe(false)
  })

  it('rejects a malformed or foreign envelope rather than throwing', async () => {
    for (const envelope of ['', 'nonsense', '$2b$10$abcdefghijklmnopqrstuv', 'scrypt$a$b$c$d$e']) {
      expect(await verifyPassword(PASSWORD, envelope)).toBe(false)
    }
  })

  it('treats unicode consistently, so a password typed the same way always works', async () => {
    const composed = 'пароль-café-12345'
    const decomposed = composed.normalize('NFD')
    expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(true)
  })
})
