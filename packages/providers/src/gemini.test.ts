import { describe, expect, it } from 'vitest'
import { GEMINI_BASE_URL, gemini } from './gemini'
import { listModels, providerById, smallestFreeModelId } from './registry'

describe('gemini provider', () => {
  it('points at the OpenAI-compatible endpoint, without a trailing slash', () => {
    // The adapter appends "/chat/completions"; a trailing slash would double it.
    expect(GEMINI_BASE_URL).toBe('https://generativelanguage.googleapis.com/v1beta/openai')
    expect(GEMINI_BASE_URL.endsWith('/')).toBe(false)
  })

  it('is registered and offers only free-tier models', () => {
    expect(providerById('gemini')).toBeDefined()
    expect(gemini.models.length).toBeGreaterThan(0)
    expect(gemini.models.every((model) => model.free)).toBe(true)
  })

  it('asks for the effort dial and no provider-specific format parameter', () => {
    // reasoning_format and include_reasoning are Groq spellings; sending either
    // to Google is a 400 rather than a no-op.
    for (const model of gemini.models) {
      expect(model.reasoning).toBe('effort')
      expect(model.reasoningEffort).toBe(true)
    }
  })

  it('carries the warning that its free tier trains on what you send', () => {
    expect(gemini.privacyWarning).toBeDefined()
    expect(gemini.privacyWarning).toMatch(/human reviewers/i)
  })

  it('appears in the pickable catalogue', () => {
    const ids = listModels().map((choice) => choice.id)
    expect(ids).toContain('gemini:gemini-3.8-flash')
  })

  it('ships none of the 2.5 models, which the API retired for new users', () => {
    // Google still lists them on the pricing and model pages; a real request
    // on 2026-09-09 answered 404 "no longer available to new users". Re-adding
    // them from the docs would put the same broken entries back in the picker.
    const retired = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
    for (const id of retired) {
      expect(gemini.models.map((model) => model.id)).not.toContain(id)
    }
  })

  it('offers only stable models, never a preview whose free tier is unconfirmed', () => {
    for (const model of gemini.models) {
      expect(model.id).not.toContain('preview')
    }
  })

  it('never becomes the shared demo model, which must stay the smallest', () => {
    // Hard constraint 2. Gemini's million-token window would be the opposite.
    expect(smallestFreeModelId().startsWith('gemini:')).toBe(false)
  })
})
