import { z } from 'zod'

/**
 * Deliberately has no prompt, response, or message field, and never will:
 * hard constraint 3 permits only provider, model, token counts, latency,
 * status and timestamp. Adding content here would also make the /privacy
 * claim false. If you need to debug a request, reproduce it locally.
 */
export const usageEventSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  status: z.number().int(),
  at: z.string().datetime(),
  /** 'direct' means the extension called the provider itself, bypassing us. */
  source: z.enum(['router', 'direct']),
  /** Whose quota paid: the signed-in user's key, or the shared demo pool. */
  keyOwner: z.enum(['user', 'operator']),
})

export type UsageEvent = z.infer<typeof usageEventSchema>

export interface UsageRecorder {
  record(event: UsageEvent): Promise<void>
}
