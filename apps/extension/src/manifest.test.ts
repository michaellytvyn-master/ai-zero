import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { orderedProviders } from '@zca/providers'

const manifest = JSON.parse(
  readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'),
) as { host_permissions?: string[] }

/**
 * In BYOK mode the panel calls each provider from the extension itself, so a
 * provider without an origin here fails at runtime with a CORS error and no
 * clue why. Adding Gemini nearly shipped exactly that.
 */
describe('manifest host permissions', () => {
  const granted = manifest.host_permissions ?? []

  it.each(orderedProviders().map((provider) => [provider.id, provider.baseUrl]))(
    'covers %s',
    (_id, baseUrl) => {
      const host = new URL(baseUrl).host
      expect(granted.some((origin) => origin.includes(host))).toBe(true)
    },
  )

  it('grants no origin broad enough to be a page-reading permission', () => {
    // Those belong in optional_host_permissions, asked for on click.
    for (const origin of granted) {
      expect(origin).not.toBe('<all_urls>')
      expect(/^https?:\/\/\*\/\*/.test(origin)).toBe(false)
    }
  })
})
