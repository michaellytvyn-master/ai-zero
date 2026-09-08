import { describe, expect, it } from 'vitest'
import {
  SecretFormatError,
  SecretKeyError,
  decryptSecret,
  encryptSecret,
  generateEncryptionKey,
  keyHint,
  secretsMatch,
} from './crypto'

const KEY = generateEncryptionKey()
const OTHER_KEY = generateEncryptionKey()
const PLAINTEXT = 'gsk_liveKeyThatMustNeverLeak0123456789'

describe('encryptSecret / decryptSecret', () => {
  it('round trips a provider key', () => {
    expect(decryptSecret(encryptSecret(PLAINTEXT, KEY), KEY)).toBe(PLAINTEXT)
  })

  it('never stores the plaintext in the envelope', () => {
    expect(encryptSecret(PLAINTEXT, KEY)).not.toContain(PLAINTEXT)
    expect(encryptSecret(PLAINTEXT, KEY)).not.toContain('gsk_')
  })

  it('produces a different envelope every time, so equal keys are not linkable', () => {
    expect(encryptSecret(PLAINTEXT, KEY)).not.toBe(encryptSecret(PLAINTEXT, KEY))
  })

  it('refuses a different encryption key', () => {
    expect(() => decryptSecret(encryptSecret(PLAINTEXT, KEY), OTHER_KEY)).toThrow()
  })

  it('refuses a tampered ciphertext', () => {
    const [version, iv, tag, ciphertext] = encryptSecret(PLAINTEXT, KEY).split('.') as [
      string,
      string,
      string,
      string,
    ]
    const flipped = `${ciphertext.slice(0, -2)}${ciphertext.slice(-2) === 'AA' ? 'AB' : 'AA'}`
    expect(() => decryptSecret([version, iv, tag, flipped].join('.'), KEY)).toThrow()
  })

  it('refuses a tampered auth tag', () => {
    const [version, iv, , ciphertext] = encryptSecret(PLAINTEXT, KEY).split('.') as [
      string,
      string,
      string,
      string,
    ]
    const forged = Buffer.alloc(16).toString('base64url')
    expect(() => decryptSecret([version, iv, forged, ciphertext].join('.'), KEY)).toThrow()
  })

  it('rejects an envelope with an unknown version', () => {
    const envelope = encryptSecret(PLAINTEXT, KEY).replace(/^v1\./, 'v2.')
    expect(() => decryptSecret(envelope, KEY)).toThrow(SecretFormatError)
  })

  it('rejects a malformed envelope', () => {
    expect(() => decryptSecret('nonsense', KEY)).toThrow(SecretFormatError)
  })

  it('rejects an encryption key of the wrong length', () => {
    expect(() => encryptSecret(PLAINTEXT, Buffer.alloc(16).toString('base64'))).toThrow(
      SecretKeyError,
    )
  })

  it('handles unicode and empty values', () => {
    for (const value of ['', 'ключ-с-юникодом-🔑']) {
      expect(decryptSecret(encryptSecret(value, KEY), KEY)).toBe(value)
    }
  })
})

describe('keyHint', () => {
  it('reveals only the last four characters', () => {
    expect(keyHint(PLAINTEXT)).toBe('6789')
    expect(keyHint(PLAINTEXT)).not.toContain('gsk_')
  })

  it('pads a short value rather than exposing all of it', () => {
    expect(keyHint('ab')).toBe('**ab')
  })
})

describe('secretsMatch', () => {
  it('accepts equal values and rejects different ones', () => {
    expect(secretsMatch('token-abc', 'token-abc')).toBe(true)
    expect(secretsMatch('token-abc', 'token-abd')).toBe(false)
    expect(secretsMatch('token-abc', 'token-abc-longer')).toBe(false)
  })
})
