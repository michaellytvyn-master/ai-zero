import { handleHealth } from '@zca/router-core'
import { allProviders } from '@/lib/router-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Unauthenticated on purpose — it is a liveness probe. It reports whether each
 * provider has a key configured, never what the key is.
 */
export function GET(): Response {
  const configured = new Set(
    allProviders()
      .filter((provider) =>
        provider.id === 'cloudflare'
          ? Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN)
          : Boolean(process.env[provider.keyEnvVar]),
      )
      .map((provider) => provider.id),
  )

  return handleHealth({
    keyFor: (provider) => (configured.has(provider.id) ? { key: 'set', owner: 'operator' } : null),
  })
}
