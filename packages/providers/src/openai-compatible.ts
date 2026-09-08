import { z } from 'zod'
import type { ChatChunk, ChatRequest } from '@zca/shared'
import { ProviderHttpError, parseRetryAfter } from './errors'
import { sseData } from './sse'

const streamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }).optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().nonnegative().optional(),
      completion_tokens: z.number().nonnegative().optional(),
    })
    .nullish(),
})

export interface OpenAICompatibleConfig {
  readonly providerId: string
  /** Without a trailing slash, e.g. https://api.groq.com/openai/v1 */
  readonly baseUrl: string
  /**
   * Whether the provider honours `stream_options.include_usage`. When false we
   * take whatever usage the final chunk carries and report zeros otherwise —
   * the savings counter must never invent token counts.
   */
  readonly usesStreamOptions: boolean
  readonly extraHeaders?: Readonly<Record<string, string>>
}

export function openAICompatibleChat(
  config: OpenAICompatibleConfig,
): (req: ChatRequest, key: string, signal: AbortSignal) => AsyncIterable<ChatChunk> {
  return async function* chat(req, key, signal) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        ...config.extraHeaders,
      },
      body: JSON.stringify(buildBody(config, req)),
    })

    if (!response.ok || response.body === null) {
      throw new ProviderHttpError(
        config.providerId,
        response.status,
        parseRetryAfter(response.headers.get('retry-after')),
        `${config.providerId} returned ${response.status}: ${await briefly(response)}`,
      )
    }

    let finishReason: string | null = null

    for await (const data of sseData(response.body)) {
      if (data === '[DONE]') break

      const parsed = streamChunkSchema.safeParse(safeJson(data))
      if (!parsed.success) continue

      const choice = parsed.data.choices?.[0]
      const content = choice?.delta?.content
      if (typeof content === 'string' && content.length > 0) {
        yield { kind: 'delta', content }
      }
      if (typeof choice?.finish_reason === 'string') {
        finishReason = choice.finish_reason
      }

      const usage = parsed.data.usage
      if (usage != null) {
        yield {
          kind: 'usage',
          inputTokens: usage.prompt_tokens ?? 0,
          outputTokens: usage.completion_tokens ?? 0,
        }
      }
    }

    yield { kind: 'stop', finishReason }
  }
}

function buildBody(config: OpenAICompatibleConfig, req: ChatRequest): Record<string, unknown> {
  return {
    model: req.model,
    messages: req.messages,
    stream: true,
    ...(req.temperature !== null ? { temperature: req.temperature } : {}),
    ...(req.maxTokens !== null ? { max_tokens: req.maxTokens } : {}),
    ...(config.usesStreamOptions ? { stream_options: { include_usage: true } } : {}),
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Truncated so a verbose provider error can never become a log of the request. */
async function briefly(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200)
  } catch {
    return '<unreadable body>'
  }
}
