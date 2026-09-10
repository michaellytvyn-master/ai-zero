import { describe, expect, it } from 'vitest'
import { activeWarning, groupedModels, pickableModels } from './models'
import type { ProviderInfo, Session } from './session'

const provider = (
  id: string,
  label: string,
  key: string | null,
  privacyWarning?: string,
): ProviderInfo => ({
  id,
  label,
  signupUrl: `https://example.test/${id}`,
  credentialHint: 'API key',
  baseUrl: `https://example.test/${id}/v1`,
  models: [
    { id: 'a', label: `${label} A`, contextWindow: 1000 },
    { id: 'b', label: `${label} B`, contextWindow: 2000 },
  ],
  ...(privacyWarning !== undefined && { privacyWarning }),
  key,
})

const session = (providers: ProviderInfo[]): Session => ({
  token: 't',
  email: 'a@b.c',
  providers,
  demo: null,
  verifiedAt: 0,
  stale: false,
})

const GROQ = provider('groq', 'Groq', 'k')
const GEMINI = provider('gemini', 'Google Gemini', 'k', 'Google reads it.')
const UNKEYED = provider('cloudflare', 'Cloudflare', null)

describe('pickableModels', () => {
  it('offers only providers the user holds a key for', () => {
    const ids = pickableModels(session([GROQ, UNKEYED])).map((model) => model.id)
    expect(ids).toEqual(['groq:a', 'groq:b'])
  })
})

describe('groupedModels', () => {
  it('groups by provider, so a flat list of eighteen is readable', () => {
    const groups = groupedModels(session([GROQ, GEMINI]))
    expect(groups.map((group) => group.providerLabel)).toEqual(['Groq', 'Google Gemini'])
    expect(groups[0]?.models).toHaveLength(2)
  })

  it('skips providers with no key', () => {
    expect(groupedModels(session([GROQ, UNKEYED]))).toHaveLength(1)
  })
})

describe('activeWarning', () => {
  it('warns when the chosen model belongs to a provider that reads what you send', () => {
    expect(activeWarning(session([GROQ, GEMINI]), 'gemini:a', false)).toContain('Google Gemini')
  })

  it('says the page is included when page reading is on', () => {
    // The reason this warning lives in the panel and not only in settings.
    expect(activeWarning(session([GROQ, GEMINI]), 'gemini:a', true)).toContain('the page below')
  })

  it('stays quiet for a provider that makes no such reservation', () => {
    expect(activeWarning(session([GROQ, GEMINI]), 'groq:a', true)).toBeNull()
  })

  it('stays quiet on auto while another provider would answer first', () => {
    // Auto runs in priority order; warning about a provider that will probably
    // not be used is how people learn to ignore warnings.
    expect(activeWarning(session([GROQ, GEMINI]), 'auto', true)).toBeNull()
  })

  it('warns on auto when that provider is the only one with a key', () => {
    expect(activeWarning(session([GEMINI, UNKEYED]), 'auto', false)).toContain('Google Gemini')
  })

  it('stays quiet when the chosen provider has no key at all', () => {
    expect(activeWarning(session([UNKEYED]), 'cloudflare:a', true)).toBeNull()
  })
})
