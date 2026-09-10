import { afterEach, describe, expect, it } from 'vitest'
import { siteOrigin, siteUrl } from './site'

const KEYS = ['NEXT_PUBLIC_SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL'] as const

afterEach(() => {
  for (const key of KEYS) delete process.env[key]
})

describe('siteOrigin', () => {
  it('falls back to localhost rather than throwing when nothing is configured', () => {
    expect(siteOrigin()).toBe('http://localhost:3000')
  })

  it('prefers the explicit variable', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://zerocost.ai'
    expect(siteOrigin()).toBe('https://zerocost.ai')
  })

  it('adds a scheme to a bare host', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'zerocost.ai'
    expect(siteOrigin()).toBe('https://zerocost.ai')
  })

  it('drops a trailing slash, so joined paths never double it', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://zerocost.ai/'
    expect(siteUrl('/privacy')).toBe('https://zerocost.ai/privacy')
  })

  it("uses Vercel's production host when nothing else is set", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'zca.vercel.app'
    expect(siteOrigin()).toBe('https://zca.vercel.app')
  })

  it('ignores an empty variable instead of producing an empty origin', () => {
    process.env.NEXT_PUBLIC_SITE_URL = '   '
    expect(siteOrigin()).toBe('http://localhost:3000')
  })
})
