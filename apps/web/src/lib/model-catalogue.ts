import { type ModelChoice, fetchLiveModels, listModels, mergeLiveModels } from '@zca/providers'
import { allProviders } from './router-deps'

/**
 * Model metadata changes without warning, and a context window copied out of a
 * documentation page quietly goes stale. Providers that publish an OpenAI-style
 * `/models` endpoint are asked directly; the registry's recorded figures are
 * the fallback, not the source of truth.
 *
 * Cached in memory for an hour. This is descriptive metadata about a handful of
 * models, not per-user state, so a shared cache is correct and a per-request
 * fetch would be waste.
 */
const CACHE_MS = 60 * 60 * 1000

let cached: { at: number; models: ModelChoice[] } | null = null

export async function modelCatalogue(signal?: AbortSignal): Promise<ModelChoice[]> {
  if (cached !== null && Date.now() - cached.at < CACHE_MS) return cached.models

  const models = [...listModels()]
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })

  try {
    for (const provider of allProviders()) {
      const key = process.env[provider.keyEnvVar]?.trim()
      if (key === undefined || key.length === 0) continue

      // One provider failing must not cost the others their figures, and must
      // never fail the request that asked for the list.
      const live = await fetchLiveModels(provider.baseUrl, key, controller.signal).catch(() => [])
      if (live.length === 0) continue

      const merged = mergeLiveModels(
        models.filter((model) => model.providerId === provider.id),
        live.map((model) => ({ ...model, id: `${provider.id}:${model.id}` })),
      )
      for (const model of merged) {
        const at = models.findIndex((entry) => entry.id === model.id)
        if (at !== -1) models[at] = model
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort)
  }

  cached = { at: Date.now(), models }
  return models
}

/** Used by tests and after a deploy that changes the registry. */
export function forgetModelCatalogue(): void {
  cached = null
}
