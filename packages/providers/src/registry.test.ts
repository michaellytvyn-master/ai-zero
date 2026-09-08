import { describe, expect, it } from 'vitest'
import { groq, mistral, cerebras } from './index'
import { orderedProviders, qualifiedModelIds, resolveModel } from './registry'

describe('resolveModel', () => {
  it('maps auto onto each provider first model so failover can switch', () => {
    expect(resolveModel(groq, 'auto')).toBe('openai/gpt-oss-20b')
    expect(resolveModel(mistral, 'auto')).toBe('ministral-3-8b-2512')
  })

  it('matches a bare model id against the provider catalogue', () => {
    expect(resolveModel(groq, 'openai/gpt-oss-120b')).toBe('openai/gpt-oss-120b')
    expect(resolveModel(mistral, 'openai/gpt-oss-120b')).toBeNull()
  })

  it('pins one provider when the id is qualified', () => {
    expect(resolveModel(groq, 'groq:openai/gpt-oss-20b')).toBe('openai/gpt-oss-20b')
    expect(resolveModel(mistral, 'groq:openai/gpt-oss-20b')).toBeNull()
  })

  it('keeps slashes in Groq model ids intact, which is why the separator is a colon', () => {
    expect(resolveModel(groq, 'groq:openai/gpt-oss-20b')).toContain('/')
  })

  it('rejects a qualified id whose model the provider does not offer', () => {
    expect(resolveModel(groq, 'groq:not-a-model')).toBeNull()
  })
})

describe('registry', () => {
  it('runs Mistral first and Cerebras last', () => {
    expect(orderedProviders().map((p) => p.id)).toEqual(['mistral', 'groq', 'cerebras'])
  })

  it('marks Cerebras models as not free, since the no-card tier was retired', () => {
    expect(cerebras.models.every((m) => m.free)).toBe(false)
    expect(groq.models.every((m) => m.free)).toBe(true)
    expect(mistral.models.every((m) => m.free)).toBe(true)
  })

  it('exposes every model as a provider-qualified id', () => {
    expect(qualifiedModelIds()).toContain('groq:openai/gpt-oss-20b')
    expect(qualifiedModelIds()).toContain('mistral:ministral-3-8b-2512')
  })

  it('only ships providers whose terms allow serving end users', () => {
    expect(orderedProviders().every((p) => p.termsAllowServingEndUsers)).toBe(true)
  })
})
