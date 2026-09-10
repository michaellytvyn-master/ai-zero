import { z } from 'zod'

export const chatRoleSchema = z.enum(['system', 'user', 'assistant', 'tool'])
export type ChatRole = z.infer<typeof chatRoleSchema>

/** One tool call, as the assistant asked for it and as it is replayed back. */
export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Raw JSON, exactly as the model wrote it. */
  args: z.string(),
})
export type ToolCall = z.infer<typeof toolCallSchema>

/**
 * A turn in the conversation. Running a tool adds two: the assistant's request
 * to run it, then a `tool` message carrying what happened. Providers reject the
 * result if it does not quote the id of the call it answers, so both are kept.
 */
export const chatMessageSchema = z.object({
  role: chatRoleSchema,
  content: z.string(),
  /** On an assistant turn: the calls it asked for. */
  toolCalls: z.array(toolCallSchema).optional(),
  /** On a tool turn: which call this is the result of. */
  toolCallId: z.string().optional(),
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
  /**
   * Ceiling on the *visible* answer. Reasoning models spend tokens thinking
   * before they write a word, and those count against the provider's own
   * ceiling — so adapters add `reasoningTokens` on top of this rather than
   * letting a thought consume the whole reply.
   */
  readonly maxTokens: number | null
  readonly reasoning?: ReasoningRequest
  /** Offered to the model; absent means a plain answer is the only option. */
  readonly tools?: readonly ToolSpec[]
}

/**
 * One function the model may ask us to run. Deliberately the OpenAI shape,
 * because every provider here speaks it and translating would only add a place
 * for the schema to drift.
 */
export interface ToolSpec {
  readonly name: string
  readonly description: string
  /** JSON Schema for the arguments. Kept opaque: providers validate it, we don't. */
  readonly parameters: Record<string, unknown>
}

export interface ReasoningRequest {
  /** Extra ceiling granted to a thinking model, on top of maxTokens. */
  readonly extraTokens: number
  /** Passed to providers that expose a native effort dial. */
  readonly effort: 'low' | 'medium' | 'high'
}

/**
 * One unit of provider output. Adapters always stream, so a non-streaming
 * response is just this sequence collected into a string.
 */
export type ChatChunk =
  | { readonly kind: 'delta'; readonly content: string }
  /** The model's own working-out, kept apart from the answer it precedes. */
  | { readonly kind: 'reasoning'; readonly content: string }
  /**
   * A complete request to run one tool. Providers stream these in fragments —
   * the name in one chunk, the arguments across several — so the adapter
   * assembles them and emits each only once it is whole. A half-parsed action
   * is not something a caller should ever be handed.
   */
  | {
      readonly kind: 'tool_call'
      readonly id: string
      readonly name: string
      /** Raw JSON as the model wrote it; the caller decides how to validate. */
      readonly args: string
    }
  | { readonly kind: 'usage'; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly kind: 'stop'; readonly finishReason: string | null }
