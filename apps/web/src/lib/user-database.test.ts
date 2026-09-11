import { describe, expect, it } from 'vitest'
import {
  UserDatabaseError,
  describeDatabase,
  insecureLocalAllowed,
  parseDatabaseUrl,
  poolConfig,
  resolvePublicHost,
} from './user-database'

// A reserved example domain, so nothing here resembles a real provider's credentials.
const GOOD = 'postgres://alice:s3cret@db.example.com/history'

describe('parseDatabaseUrl', () => {
  it('reads a hosted Postgres address', () => {
    expect(parseDatabaseUrl(GOOD, false)).toEqual({
      host: 'db.example.com',
      port: 5432,
      user: 'alice',
      password: 's3cret',
      database: 'history',
      tls: 'verify',
      options: null,
    })
  })

  it('accepts the postgresql:// spelling too', () => {
    expect(parseDatabaseUrl(GOOD.replace('postgres:', 'postgresql:'), false).host).toBe(
      'db.example.com',
    )
  })

  it('decodes a password that needed escaping', () => {
    expect(parseDatabaseUrl('postgres://a:p%40ss%3Aword@db.example.com/x', false).password).toBe(
      'p@ss:word',
    )
  })

  it.each([
    ['another protocol', 'mysql://a:b@db.example.com/x'],
    ['a web address', 'https://db.example.com/x'],
    ['no password', 'postgres://alice@db.example.com/x'],
    ['no database', 'postgres://alice:pw@db.example.com/'],
    ['a port out of range', 'postgres://alice:pw@db.example.com:70000/x'],
    ['nothing usable', 'not a url'],
  ])('refuses %s', (_label, address) => {
    expect(() => parseDatabaseUrl(address, false)).toThrow(UserDatabaseError)
  })

  it('follows libpq: verify by default, encrypt only when asked', () => {
    expect(parseDatabaseUrl(GOOD, false).tls).toBe('verify')
    expect(parseDatabaseUrl(`${GOOD}?sslmode=require`, false).tls).toBe('encrypt')
    expect(parseDatabaseUrl(`${GOOD}?sslmode=verify-full`, false).tls).toBe('verify')
  })

  it('refuses an unencrypted connection, which would carry chats in the clear', () => {
    expect(() => parseDatabaseUrl(`${GOOD}?sslmode=disable`, false)).toThrow(/unencrypted/)
  })
})

describe('insecureLocalAllowed', () => {
  it('is inert in production, whatever the flag says', () => {
    // The escape hatch for the test suite must not survive into a deployment.
    expect(
      insecureLocalAllowed({ NODE_ENV: 'production', USER_DATABASE_INSECURE_LOCAL: 'true' }),
    ).toBe(false)
  })

  it('is off unless asked for, even in development', () => {
    expect(insecureLocalAllowed({ NODE_ENV: 'development' })).toBe(false)
    expect(insecureLocalAllowed({ NODE_ENV: 'test', USER_DATABASE_INSECURE_LOCAL: 'true' })).toBe(
      true,
    )
  })
})

describe('resolvePublicHost — the server must not be pointed inside its own network', () => {
  const resolvingTo =
    (...addresses: string[]) =>
    async () =>
      addresses.map((address) => ({ address }))

  it('returns the resolved address, so the connection never resolves the name again', async () => {
    expect(await resolvePublicHost('db.example.com', false, resolvingTo('203.0.113.7'))).toBe(
      '203.0.113.7',
    )
  })

  it.each([
    ['a private address', '10.0.0.5'],
    ['loopback', '127.0.0.1'],
    ['the cloud metadata endpoint', '169.254.169.254'],
    ['IPv6 loopback', '::1'],
    ['an IPv6 unique-local address', 'fd12:3456::1'],
    ['an IPv4 address in IPv6 clothing', '::ffff:10.0.0.5'],
  ])('refuses %s', async (_label, address) => {
    await expect(resolvePublicHost('db.example.com', false, resolvingTo(address))).rejects.toThrow(
      /private network/,
    )
  })

  it('refuses a name with one public and one private record, not a coin toss', async () => {
    await expect(
      resolvePublicHost('db.example.com', false, resolvingTo('203.0.113.7', '10.0.0.5')),
    ).rejects.toThrow(/private network/)
  })

  it('says so plainly when the host does not exist', async () => {
    const missing = async () => {
      throw new Error('ENOTFOUND')
    }
    await expect(resolvePublicHost('nope.invalid', false, missing)).rejects.toThrow(
      /could not be found/,
    )
  })
})

describe('poolConfig', () => {
  const parsed = parseDatabaseUrl(GOOD, false)

  it('connects to the checked address but validates TLS against the real name', () => {
    const config = poolConfig(parsed, '203.0.113.7')
    expect(config.host).toBe('203.0.113.7')
    expect(config.ssl).toEqual({
      servername: 'db.example.com',
      rejectUnauthorized: true,
    })
  })

  it('encrypts without checking the certificate only when the address asked for that', () => {
    const config = poolConfig(parseDatabaseUrl(`${GOOD}?sslmode=require`, false), '203.0.113.7')
    expect(config.ssl).toMatchObject({ rejectUnauthorized: false })
  })

  it('keeps pools small and statements bounded, since each is one person’s history', () => {
    const config = poolConfig(parsed, '203.0.113.7')
    expect(config.max).toBeLessThanOrEqual(2)
    expect(config.statement_timeout).toBeGreaterThan(0)
  })
})

describe('describeDatabase', () => {
  it('shows where, never the password', () => {
    expect(describeDatabase(GOOD)).toBe('db.example.com / history')
    expect(describeDatabase(GOOD)).not.toContain('s3cret')
  })
})
