import type { ModelOption } from './models'

/** Roughly four characters per token across the languages this sees. */
const CHARS_PER_TOKEN = 4

/** Leaves room for the conversation and the reply, not just the page. */
const SHARE_OF_CONTEXT = 0.5

/** Used when the model is "auto", so the smallest model still fits. */
const CONSERVATIVE_TOKENS = 3000

const FLOOR_CHARS = 2000
const CEILING_CHARS = 120_000

/**
 * How much page text may be attached. Sized from the chosen model's context
 * window, because pasting 80k characters into an 8k-token model fails the
 * request outright rather than degrading.
 */
export function contextCharBudget(models: readonly ModelOption[], selectedId: string): number {
  const chosen = models.find((model) => model.id === selectedId)
  const tokens =
    chosen === undefined ? CONSERVATIVE_TOKENS : Math.floor(chosen.contextWindow * SHARE_OF_CONTEXT)

  return Math.min(CEILING_CHARS, Math.max(FLOOR_CHARS, tokens * CHARS_PER_TOKEN))
}
