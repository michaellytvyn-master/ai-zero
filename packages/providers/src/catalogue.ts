import { z } from 'zod'
import { ProviderHttpError, parseRetryAfter } from './errors'

const modelSchema = z.object({
  id: z.string(),
  context_window: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  active: z.boolean().optional(),
})

const listSchema = z.object({ data: z.array(modelSchema) })

export interface LiveModel {
  readonly id: string
  readonly contextWindow: number | null
  readonly maxCompletionTokens: number | null
}

/**
 * Reads a provider's own catalogue instead of trusting numbers copied out of
 * its documentation. Only providers exposing the OpenAI `/models` shape with a
 * `context_window` field return anything useful; the rest simply have no entry
 * and the registry's recorded value stands.
 */
export async function fetchLiveModels(
  baseUrl: string,
  key: string,
  signal: AbortSignal,
): Promise<LiveModel[]> {
  const response = await fetch(`${baseUrl}/models`, {
    signal,
    headers: { authorization: `Bearer ${key}` },
  })

  if (!response.ok) {
    throw new ProviderHttpError(
      baseUrl,
      response.status,
      parseRetryAfter(response.headers.get('retry-after')),
      `model catalogue returned ${response.status}`,
    )
  }

  const parsed = listSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) return []

  return parsed.data.data
    .filter((model) => model.active !== false)
    .map((model) => ({
      id: model.id,
      contextWindow: model.context_window ?? null,
      maxCompletionTokens: model.max_completion_tokens ?? null,
    }))
}

/**
 * Merges live figures onto models the registry already ships, and deliberately
 * does not add new ones: the catalogue lists everything a key can reach,
 * including paid models, while the registry is the list that is free.
 */
export function mergeLiveModels<T extends { id: string; contextWindow: number }>(
  known: readonly T[],
  live: readonly LiveModel[],
): T[] {
  const byId = new Map(live.map((model) => [model.id, model]))
  return known.map((model) => {
    const found = byId.get(model.id)
    return found?.contextWindow == null ? model : { ...model, contextWindow: found.contextWindow }
  })
}
