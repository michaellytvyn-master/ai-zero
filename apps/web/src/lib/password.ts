import { type ScryptOptions, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// promisify loses the options overload, so the wrapper is written out.
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error)
      else resolve(derived)
    })
  })
}

/**
 * scrypt from node:crypto rather than a bcrypt/argon2 dependency: it is a
 * proper memory-hard KDF, it ships with the runtime, and this is the whole
 * implementation.
 *
 * N=2^15 with r=8 needs 128*N*r = 32 MiB, which is exactly Node's default
 * maxmem, so maxmem is raised or every hash throws.
 */
const COST = 2 ** 15
const BLOCK_SIZE = 8
const PARALLELISM = 1
const KEY_LENGTH = 64
const MAX_MEMORY = 64 * 1024 * 1024

export const MIN_PASSWORD_LENGTH = 10

export class WeakPasswordError extends Error {}

export function assertUsablePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(
      `Use at least ${MIN_PASSWORD_LENGTH} characters. Length beats punctuation.`,
    )
  }
  if (password.length > 1024) {
    throw new WeakPasswordError('That password is unreasonably long.')
  }
}

/** Envelope: `scrypt$N$r$p$salt$hash`, both tails base64url. */
export async function hashPassword(password: string): Promise<string> {
  assertUsablePassword(password)
  const salt = randomBytes(16)
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAX_MEMORY,
  })

  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

export async function verifyPassword(password: string, envelope: string): Promise<boolean> {
  const parts = envelope.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, cost, blockSize, parallelism, salt, expected] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ]

  const expectedBytes = Buffer.from(expected, 'base64url')
  if (expectedBytes.length === 0) return false

  let derived: Buffer
  try {
    derived = await scryptAsync(
      password.normalize('NFKC'),
      Buffer.from(salt, 'base64url'),
      expectedBytes.length,
      {
        N: Number(cost),
        r: Number(blockSize),
        p: Number(parallelism),
        maxmem: MAX_MEMORY,
      },
    )
  } catch {
    return false
  }

  return derived.length === expectedBytes.length && timingSafeEqual(derived, expectedBytes)
}
