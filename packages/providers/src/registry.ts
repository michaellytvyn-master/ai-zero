import { cloudflare } from './cloudflare'
import { groq, groqTranscriber } from './groq'
import type { Transcriber } from './transcription'
import type { Provider } from './types'

export const providers: readonly Provider[] = [groq, cloudflare]

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

export interface ModelChoice {
  /** Qualified id, as sent on the wire: `groq:openai/gpt-oss-20b`. */
  readonly id: string
  readonly label: string
  readonly providerId: string
  readonly providerLabel: string
  readonly contextWindow: number
}

/** Everything a user may pick, provider order first, then the provider's own order. */
export function listModels(): readonly ModelChoice[] {
  return orderedProviders().flatMap((provider) =>
    provider.models
      .filter((model) => model.free)
      .map((model) => ({
        id: `${provider.id}:${model.id}`,
        label: model.label,
        providerId: provider.id,
        providerLabel: provider.label,
        contextWindow: model.contextWindow,
      })),
  )
}

/**
 * Hard constraint 2: demo mode runs the smallest model only. "Smallest" is
 * approximated by context window, which is the only size signal a ModelSpec
 * carries and correlates well enough in practice.
 */
export function smallestFreeModelId(): string {
  const choices = [...listModels()].sort((a, b) => a.contextWindow - b.contextWindow)
  const smallest = choices[0]
  if (smallest === undefined) throw new Error('no free models are registered')
  return smallest.id
}

/** Only Groq offers speech-to-text on a free tier today. */
export const transcribers: readonly Transcriber[] = [groqTranscriber]

export function transcriberFor(providerId: string): Transcriber | undefined {
  return transcribers.find((item) => item.providerId === providerId)
}

export function defaultTranscriber(): Transcriber | undefined {
  return transcribers[0]
}
