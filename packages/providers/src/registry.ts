import { cloudflare } from './cloudflare'
import { groq } from './groq'
import { mistral } from './mistral'
import type { Provider } from './types'

export const providers: readonly Provider[] = [mistral, groq, cloudflare]

export function orderedProviders(): readonly Provider[] {
  return [...providers].sort((a, b) => a.priority - b.priority)
}

export function providerById(id: string): Provider | undefined {
  return providers.find((p) => p.id === id)
}

/**
 * Model ids are `<providerId>:<modelId>` because Groq's own ids contain
 * slashes (`openai/gpt-oss-20b`), which rules out `provider/model`.
 *
 * - `auto`               -> each provider's first model, so failover can switch
 * - `groq:openai/gpt-oss-20b` -> pins one provider
 * - `openai/gpt-oss-20b`      -> any provider offering that id
 *
 * Returns the id to put on the wire, or null if this provider cannot serve it.
 */
export function resolveModel(provider: Provider, requested: string): string | null {
  if (requested === 'auto') return provider.models[0]?.id ?? null

  const separator = requested.indexOf(':')
  if (separator !== -1) {
    const pinned = requested.slice(0, separator)
    const modelId = requested.slice(separator + 1)
    if (pinned !== provider.id) return null
    return provider.models.some((m) => m.id === modelId) ? modelId : null
  }

  return provider.models.some((m) => m.id === requested) ? requested : null
}

export function qualifiedModelIds(): readonly string[] {
  return orderedProviders().flatMap((p) => p.models.map((m) => `${p.id}:${m.id}`))
}
