import { describe, expect, it } from 'vitest'
import { cloudflare, groq, mistral } from './index'
import { orderedProviders, providers, qualifiedModelIds, resolveModel } from './registry'

describe('resolveModel', () => {
  it('maps auto onto each provider first model so failover can switch', () => {
    expect(resolveModel(groq, 'auto')).toBe('openai/gpt-oss-20b')
    expect(resolveModel(mistral, 'auto')).toBe('ministral-3-8b-2512')
    expect(resolveModel(cloudflare, 'auto')).toBe('@cf/openai/gpt-oss-120b')
  })

  it('matches a bare model id against the provider catalogue', () => {
    expect(resolveModel(groq, 'openai/gpt-oss-120b')).toBe('openai/gpt-oss-120b')
    expect(resolveModel(mistral, 'openai/gpt-oss-120b')).toBeNull()
  })

  it('pins one provider when the id is qualified', () => {
    expect(resolveModel(groq, 'groq:openai/gpt-oss-20b')).toBe('openai/gpt-oss-20b')
    expect(resolveModel(mistral, 'groq:openai/gpt-oss-20b')).toBeNull()
  })

  it('keeps slashes in model ids intact, which is why the separator is a colon', () => {
    expect(resolveModel(groq, 'groq:openai/gpt-oss-20b')).toContain('/')
    expect(resolveModel(cloudflare, 'cloudflare:@cf/meta/llama-3.1-8b-instruct')).toBe(
      '@cf/meta/llama-3.1-8b-instruct',
    )
  })

  it('rejects a qualified id whose model the provider does not offer', () => {
    expect(resolveModel(groq, 'groq:not-a-model')).toBeNull()
  })
})

describe('registry', () => {
  it('runs the largest free allowance first', () => {
    expect(orderedProviders().map((p) => p.id)).toEqual(['mistral', 'groq', 'cloudflare'])
  })

  /**
   * The project's whole premise. A provider that needs a payment method does
   * not belong in the registry, however good it is — Cerebras was removed for
   * exactly this after it retired its no-card tier in August 2026.
   */
  it('ships only providers whose models are reachable without a credit card', () => {
    for (const provider of providers) {
      expect(provider.models.length).toBeGreaterThan(0)
      expect(
        provider.models.every((model) => model.free),
        `${provider.id} ships a model that is not on a free tier`,
      ).toBe(true)
    }
  })

  it('only ships providers whose terms allow serving end users', () => {
    expect(providers.every((p) => p.termsAllowServingEndUsers)).toBe(true)
  })

  it('tells the user what each credential looks like', () => {
    for (const provider of providers) {
      expect(provider.credentialHint.length).toBeGreaterThan(0)
      expect(provider.signupUrl).toMatch(/^https:\/\//)
    }
  })

  it('exposes every model as a provider-qualified id', () => {
    expect(qualifiedModelIds()).toContain('groq:openai/gpt-oss-20b')
    expect(qualifiedModelIds()).toContain('mistral:ministral-3-8b-2512')
    expect(qualifiedModelIds()).toContain('cloudflare:@cf/openai/gpt-oss-120b')
  })
})
