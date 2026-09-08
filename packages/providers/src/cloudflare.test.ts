import { describe, expect, it } from 'vitest'
import {
  CloudflareCredentialError,
  cloudflare,
  cloudflareBaseUrl,
  parseCloudflareCredential,
} from './cloudflare'

describe('parseCloudflareCredential', () => {
  it('splits the account id from the token', () => {
    expect(parseCloudflareCredential('abc123:tok_secret')).toEqual({
      accountId: 'abc123',
      token: 'tok_secret',
    })
  })

  it('keeps colons that belong to the token', () => {
    expect(parseCloudflareCredential('abc123:tok:with:colons').token).toBe('tok:with:colons')
  })

  it('tolerates surrounding whitespace from a paste', () => {
    expect(parseCloudflareCredential(' abc123 : tok_secret ')).toEqual({
      accountId: 'abc123',
      token: 'tok_secret',
    })
  })

  it('rejects a plain key, rather than sending a request that cannot work', () => {
    expect(() => parseCloudflareCredential('just-a-token')).toThrow(CloudflareCredentialError)
    expect(() => parseCloudflareCredential(':tok')).toThrow(CloudflareCredentialError)
    expect(() => parseCloudflareCredential('abc:')).toThrow(CloudflareCredentialError)
  })
})

describe('cloudflareBaseUrl', () => {
  it('puts the account id in the path, where Cloudflare expects it', () => {
    expect(cloudflareBaseUrl('abc123')).toBe(
      'https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1',
    )
  })
})

describe('the cloudflare provider', () => {
  it('ships no model that Cloudflare requires a payment method for', () => {
    const paidOnly = ['kimi', 'glm-5', 'deepseek-v4']
    for (const model of cloudflare.models) {
      for (const marker of paidOnly) {
        expect(model.id).not.toContain(marker)
      }
    }
  })

  it('uses @cf-prefixed identifiers', () => {
    expect(cloudflare.models.every((model) => model.id.startsWith('@cf/'))).toBe(true)
  })

  it('says what the credential looks like, since one opaque key is not enough', () => {
    expect(cloudflare.credentialHint).toContain('account id')
  })
})
