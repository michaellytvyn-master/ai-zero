import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12

export class SecretFormatError extends Error {}
export class SecretKeyError extends Error {}

/**
 * Envelope: `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 *
 * The version prefix exists so keys can be re-wrapped under a new
 * KEY_ENCRYPTION_KEY later without guessing how old rows were written.
 */
export function encryptSecret(plaintext: string, keyBase64: string): string {
  const key = decodeKey(keyBase64)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(ciphertext)].join('.')
}

export function decryptSecret(envelope: string, keyBase64: string): string {
  const parts = envelope.split('.')
  if (parts.length !== 4) throw new SecretFormatError('malformed secret envelope')

  const [version, ivPart, tagPart, ciphertextPart] = parts as [string, string, string, string]
  if (version !== VERSION) throw new SecretFormatError(`unsupported envelope version ${version}`)

  const decipher = createDecipheriv(ALGORITHM, decodeKey(keyBase64), unb64(ivPart))
  decipher.setAuthTag(unb64(tagPart))
  // GCM authentication fails here if either the ciphertext or the tag was
  // altered, so a tampered row can never decrypt to attacker-chosen bytes.
  return Buffer.concat([decipher.update(unb64(ciphertextPart)), decipher.final()]).toString('utf8')
}

/** Last four characters, so the UI can name a key without decrypting it. */
export function keyHint(plaintext: string): string {
  return plaintext.trim().slice(-4).padStart(4, '*')
}

export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString('base64')
}

/** Constant-time, for comparing extension tokens and similar bearer values. */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function decodeKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new SecretKeyError(
      `KEY_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`,
    )
  }
  return key
}

const b64 = (buffer: Buffer): string => buffer.toString('base64url')
const unb64 = (value: string): Buffer => Buffer.from(value, 'base64url')
