import { describe, expect, it } from 'vitest'
import { CloudinaryCredentialError, parseCloudinaryCredential } from './cloudinary'
import { CLOUDINARY_KEY_ID } from './image-store'
import { expiryFor, IMAGE_LIFETIME_MS } from './images'

describe('parseCloudinaryCredential', () => {
  it('splits the three values the dashboard shows together', () => {
    expect(parseCloudinaryCredential('demo:123456789:abcDEF_secret')).toEqual({
      cloudName: 'demo',
      apiKey: '123456789',
      apiSecret: 'abcDEF_secret',
    })
  })

  it('keeps colons that belong to the secret', () => {
    expect(parseCloudinaryCredential('demo:123:se:cr:et').apiSecret).toBe('se:cr:et')
  })

  it('tolerates the whitespace a paste brings with it', () => {
    expect(parseCloudinaryCredential('  demo : 123 : secret  ')).toEqual({
      cloudName: 'demo',
      apiKey: '123',
      apiSecret: 'secret',
    })
  })

  it('rejects anything short of all three, rather than signing with a blank secret', () => {
    expect(() => parseCloudinaryCredential('demo:123')).toThrow(CloudinaryCredentialError)
    expect(() => parseCloudinaryCredential('demo')).toThrow(CloudinaryCredentialError)
    expect(() => parseCloudinaryCredential(':123:secret')).toThrow(CloudinaryCredentialError)
    expect(() => parseCloudinaryCredential('demo::secret')).toThrow(CloudinaryCredentialError)
  })
})

describe('expiryFor', () => {
  it('gives a picture in the user own account no expiry at all', () => {
    // The whole point of connecting an account: we stop deciding when it goes.
    expect(expiryFor('user')).toBeNull()
  })

  it('keeps the hour on the shared test pool', () => {
    const now = Date.UTC(2026, 8, 9)
    expect(expiryFor('operator', now)?.getTime()).toBe(now + IMAGE_LIFETIME_MS)
  })
})

describe('the image store credential', () => {
  it('is not a model provider id, so it cannot be mistaken for one', async () => {
    // buildRouterContext decides "is this user on their own keys?" by looking
    // for a model provider's key. If image storage shared an id with one, a
    // user who only connected somewhere to keep pictures would be silently
    // taken off the shared model pool.
    const { providers } = await import('@zca/providers')
    expect(providers.map((provider) => provider.id)).not.toContain(CLOUDINARY_KEY_ID)
  })
})
