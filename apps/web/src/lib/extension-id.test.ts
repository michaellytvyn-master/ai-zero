import { describe, expect, it } from 'vitest'

process.env.DATABASE_URL ??= 'postgres://localhost/unused'
const { extensionAllowed, extensionIdFrom } = await import('./extension-auth')

const ID = 'abcdefghijklmnopabcdefghijklmnop'

describe('extensionIdFrom', () => {
  it('reads the id from the address an extension receives the token at', () => {
    expect(extensionIdFrom(`https://${ID}.chromiumapp.org/`)).toBe(ID)
    expect(extensionIdFrom(`https://${ID}.chromiumapp.org`)).toBe(ID)
  })

  it.each([
    ['another site', 'https://evil.example/'],
    ['a lookalike host', `https://${ID}.chromiumapp.org.evil.example/`],
    ['a path smuggled on', `https://${ID}.chromiumapp.org/steal?x=1`],
    ['plain http', `http://${ID}.chromiumapp.org/`],
    [
      'an id with a letter Chrome never uses',
      'https://abcdefghijklmnopabcdefghijklmnoz.chromiumapp.org/',
    ],
    ['nothing at all', undefined],
  ])('refuses %s, which would turn the page into an open redirect', (_label, address) => {
    expect(extensionIdFrom(address)).toBeNull()
  })
})

describe('extensionAllowed', () => {
  it('serves any extension when no list is set, as before', () => {
    expect(extensionAllowed(ID, '')).toBe(true)
    expect(extensionAllowed(ID, undefined)).toBe(true)
  })

  it('serves only listed extensions once a list is set', () => {
    const other = 'ponmlkjihgfedcbaponmlkjihgfedcba'
    // Without this, any installed extension could open the consent page,
    // styled as this product's, and be handed the token on "Allow".
    expect(extensionAllowed(ID, `${other}, ${ID}`)).toBe(true)
    expect(extensionAllowed(other, ID)).toBe(false)
  })
})
