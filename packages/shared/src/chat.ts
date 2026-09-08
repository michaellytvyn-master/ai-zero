import { z } from 'zod'

export const chatRoleSchema = z.enum(['system', 'user', 'assistant'])
export type ChatRole = z.infer<typeof chatRoleSchema>

export const chatMessageSchema = z.object({
  role: chatRoleSchema,
  content: z.string(),
})
export type ChatMessage = z.infer<typeof chatMessageSchema>

/**
 * Normalised request handed to every provider adapter. Adapters translate this
 * into their own wire shape; the OpenAI snake_case form lives at the HTTP edge.
 */
export interface ChatRequest {
  readonly model: string
  readonly messages: readonly ChatMessage[]
  readonly temperature: number | null
  readonly maxTokens: number | null
}

/**
 * One unit of provider output. Adapters always stream, so a non-streaming
 * response is just this sequence collected into a string.
 */
export type ChatChunk =
  | { readonly kind: 'delta'; readonly content: string }
  | { readonly kind: 'usage'; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly kind: 'stop'; readonly finishReason: string | null }
