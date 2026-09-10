/**
 * Public identity of the site, in one place, because canonical URLs, the
 * sitemap, robots.txt and every Open Graph tag have to agree on it.
 */

export const SITE_NAME = 'Zero-Cost AI'

export const SITE_DESCRIPTION =
  'Bring your own free LLM provider keys and get one chat, one OpenAI-compatible API and a ' +
  'browser side panel over them, with automatic failover when a provider is rate limited.'

const FALLBACK_ORIGIN = 'http://localhost:3000'

/**
 * Resolving this must never throw. A missing marketing variable should leave
 * the canonical tags pointing somewhere useless, not take down the page that
 * carries them — which is why this is not one of the validated config slices.
 */
export function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit !== undefined && explicit !== '') return withScheme(explicit).replace(/\/+$/, '')

  // Vercel exposes the production host without a scheme.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel !== undefined && vercel !== '') return withScheme(vercel).replace(/\/+$/, '')

  return FALLBACK_ORIGIN
}

export function siteUrl(path = '/'): string {
  return new URL(path, `${siteOrigin()}/`).toString()
}

function withScheme(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

/**
 * Every route a crawler is allowed to see. Anything not listed here is behind
 * a sign-in and is marked noindex at the page that renders it.
 */
export const PUBLIC_ROUTES = ['/', '/signin', '/register', '/privacy', '/terms'] as const

/** Routes that exist only for a signed-in user, and that robots.txt disallows. */
export const PRIVATE_ROUTES = ['/chat', '/settings', '/admin', '/extension', '/api'] as const
