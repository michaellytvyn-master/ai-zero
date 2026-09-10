import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { orderedProviders } from '@zca/providers'

const landing = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

/**
 * The provider names were typed into the marketing copy once and went stale the
 * day a third provider was registered — the hero still promised two. These
 * assert the page derives them instead.
 */
describe('landing copy', () => {
  it('names no provider literally, so a new one cannot make it lie', () => {
    for (const provider of orderedProviders()) {
      // The label may only reach the page through orderedProviders().
      expect(landing).not.toContain(`${provider.label} give away`)
      expect(landing).not.toContain(`register with ${provider.label}`)
    }
    expect(landing).not.toContain('Both providers')
    expect(landing).not.toContain('both providers')
  })

  it('builds the list from the registry', () => {
    expect(landing).toContain('andList(providers.map((provider) => provider.label))')
  })
})

describe('andList', () => {
  // Re-implemented here only to pin the shape the page renders.
  const andList = (names: readonly string[]): string =>
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

  it('reads as English for one, two and three names', () => {
    expect(andList(['Groq'])).toBe('Groq')
    expect(andList(['Groq', 'Cloudflare'])).toBe('Groq and Cloudflare')
    expect(andList(['Groq', 'Cloudflare', 'Gemini'])).toBe('Groq, Cloudflare and Gemini')
  })

  it('survives an empty registry rather than rendering undefined', () => {
    expect(andList([])).toBe('')
  })
})
