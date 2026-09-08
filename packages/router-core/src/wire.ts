import { z } from 'zod'
import { chatMessageSchema, type ChatRequest } from '@zca/shared'

export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1).default('auto'),
  messages: z.array(chatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).nullish(),
  max_tokens: z.number().int().positive().nullish(),
  stream: z.boolean().default(false),
})

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>

export function toChatRequest(input: ChatCompletionRequest): ChatRequest {
  return {
    model: input.model,
    messages: input.messages,
    temperature: input.temperature ?? null,
    maxTokens: input.max_tokens ?? null,
  }
}

export function sseEvent(data: unknown, event?: string): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  return event === undefined ? `data: ${payload}\n\n` : `event: ${event}\ndata: ${payload}\n\n`
}

export function chunkPayload(
  id: string,
  created: number,
  model: string,
  delta: { content?: string },
  finishReason: string | null,
): unknown {
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
}

export function completionPayload(
  id: string,
  created: number,
  model: string,
  providerId: string,
  content: string,
  finishReason: string | null,
  inputTokens: number,
  outputTokens: number,
): unknown {
  return {
    id,
    object: 'chat.completion',
    created,
    model,
    // Non-standard, mirrors the streaming `provider` event so both shapes can
    // tell the UI who answered.
    x_provider: providerId,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  }
}
