import { describe, expect, it } from 'vitest'
import { cloudflare, groq } from './index'
import {
  listModels,
  orderedProviders,
  providers,
  qualifiedModelIds,
  resolveModel,
  smallestFreeModelId,
} from './registry'

describe('resolveModel', () => {
  it('maps auto onto each provider first model so failover can switch', () => {
    expect(resolveModel(groq, 'auto')).toBe('openai/gpt-oss-120b')
    expect(resolveModel(cloudflare, 'auto')).toBe('@cf/openai/gpt-oss-120b')
  })

  it('matches a bare model id against the provider catalogue', () => {
    expect(resolveModel(groq, 'qwen/qwen3.8-27b')).toBe('qwen/qwen3.8-27b')
    expect(resolveModel(cloudflare, 'qwen/qwen3.8-27b')).toBeNull()
  })

  it('pins one provider when the id is qualified', () => {
    expect(resolveModel(groq, 'groq:openai/gpt-oss-20b')).toBe('openai/gpt-oss-20b')
    expect(resolveModel(cloudflare, 'groq:openai/gpt-oss-20b')).toBeNull()
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
  it('runs Groq first, then Cloudflare', () => {
    expect(orderedProviders().map((p) => p.id)).toEqual(['groq', 'cloudflare'])
  })

  /**
   * The project's whole premise. A provider needing a payment method does not
   * belong here however good it is: Cerebras was removed when it retired its
   * no-card tier, and Mistral when its console stopped showing free models.
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
    expect(qualifiedModelIds()).toContain('cloudflare:@cf/openai/gpt-oss-120b')
  })
})

describe('listModels', () => {
  it('offers every free model across every provider', () => {
    const choices = listModels()

    expect(choices.length).toBe(groq.models.length + cloudflare.models.length)
    expect(choices.every((choice) => choice.id.includes(':'))).toBe(true)
  })

  it('carries what a picker needs to render a grouped list', () => {
    for (const choice of listModels()) {
      expect(choice.label.length).toBeGreaterThan(0)
      expect(choice.providerLabel.length).toBeGreaterThan(0)
      expect(choice.contextWindow).toBeGreaterThan(0)
    }
  })

  it('groups by provider, in failover order', () => {
    const order = listModels().map((choice) => choice.providerId)
    expect(order).toEqual([...order].sort((a, b) => (a === b ? 0 : a === 'groq' ? -1 : 1)))
  })

  it('every id it offers resolves back to a real model', () => {
    for (const choice of listModels()) {
      const provider = providers.find((p) => p.id === choice.providerId)
      expect(provider).toBeDefined()
      expect(resolveModel(provider as (typeof providers)[number], choice.id)).not.toBeNull()
    }
  })
})

describe('smallestFreeModelId', () => {
  it('picks the smallest context window, for the capped demo pool', () => {
    expect(smallestFreeModelId()).toBe('cloudflare:@cf/meta/llama-3.1-8b-instruct')
  })
})
