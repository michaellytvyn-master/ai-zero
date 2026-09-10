import { z } from 'zod'
import type { ChatChunk, ChatMessage, ChatRequest } from '@zca/shared'
import { ProviderHttpError, parseRetryAfter } from './errors'
import { sseData } from './sse'
import { ThinkSplitter } from './think-split'
import { ToolCallAssembler } from './tool-calls'
import type { ModelSpec } from './types'

const streamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            // Groq's parsed form. `reasoning_content` is the DeepSeek-style
            // spelling; accepting both costs nothing and spares us a per-
            // provider branch.
            reasoning: z.string().nullish(),
            reasoning_content: z.string().nullish(),
            // Streamed in fragments and addressed by index, not by id: only
            // the first fragment of a call carries the id and the name.
            tool_calls: z
              .array(
                z.object({
                  index: z.number().int().nonnegative(),
                  id: z.string().nullish(),
                  function: z
                    .object({ name: z.string().nullish(), arguments: z.string().nullish() })
                    .optional(),
                }),
              )
              .nullish(),
          })
          .optional(),
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
  /** Used to work out how the requested model surfaces its reasoning. */
  readonly models?: readonly ModelSpec[]
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
    // Only models that wrap reasoning in tags need splitting; for the rest this
    // would still be correct, but it would hold a few characters back for no
    // reason at the end of every stream.
    const splitter = spec(config, req.model)?.reasoning === 'tags' ? new ThinkSplitter() : null
    const calls = new ToolCallAssembler()

    for await (const data of sseData(response.body)) {
      if (data === '[DONE]') break

      const parsed = streamChunkSchema.safeParse(safeJson(data))
      if (!parsed.success) continue

      const choice = parsed.data.choices?.[0]

      // Providers that separate reasoning for us hand it over in its own field.
      const thought = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content
      if (typeof thought === 'string' && thought.length > 0) {
        yield { kind: 'reasoning', content: thought }
      }

      const content = choice?.delta?.content
      if (typeof content === 'string' && content.length > 0) {
        if (splitter === null) {
          yield { kind: 'delta', content }
        } else {
          for (const piece of splitter.push(content)) yield piece
        }
      }
      const fragments = choice?.delta?.tool_calls
      if (fragments != null) calls.push(fragments)

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

    // Releases anything the splitter was holding in case it was a tag. Without
    // this a reply ending in "<" would lose its last character.
    if (splitter !== null) {
      for (const piece of splitter.end()) yield piece
    }

    // Emitted only now: a tool call is only meaningful once its arguments are
    // complete, and they arrive a few characters at a time.
    for (const call of calls.finish()) yield call

    yield { kind: 'stop', finishReason }
  }
}

function buildBody(config: OpenAICompatibleConfig, req: ChatRequest): Record<string, unknown> {
  const model = spec(config, req.model)

  return {
    model: req.model,
    // Rebuilt field by field rather than passed through. Structural typing lets
    // a caller hand us objects carrying extra properties — a React key, say —
    // and providers reject the whole request when they arrive on the wire.
    messages: req.messages.map(wireMessage),
    stream: true,
    ...(req.temperature !== null ? { temperature: req.temperature } : {}),
    ...(req.maxTokens !== null ? { max_tokens: wireMaxTokens(req, model) } : {}),
    ...(req.tools !== undefined && req.tools.length > 0
      ? {
          tools: req.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
        }
      : {}),
    ...reasoningParams(req, model),
    ...(config.usesStreamOptions ? { stream_options: { include_usage: true } } : {}),
  }
}

/**
 * A tool result must quote the id of the call it answers, and an assistant turn
 * that asked for tools must carry them, or the provider rejects the next
 * request as an orphaned result.
 */
function wireMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      ...(message.toolCallId === undefined ? {} : { tool_call_id: message.toolCallId }),
    }
  }

  if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
    return {
      role: message.role,
      // OpenAI-shaped providers expect null, not "", beside tool calls.
      content: message.content.length > 0 ? message.content : null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.args },
      })),
    }
  }

  return { role: message.role, content: message.content }
}

function spec(config: OpenAICompatibleConfig, modelId: string): ModelSpec | undefined {
  return config.models?.find((candidate) => candidate.id === modelId)
}

/**
 * A thinking model spends its budget reasoning before it writes anything, and
 * providers count those tokens against max_tokens like any other. Sending the
 * answer budget alone is what truncates the reply mid-thought, so a reasoning
 * model gets the requested headroom on top.
 */
function wireMaxTokens(req: ChatRequest, model: ModelSpec | undefined): number {
  const answer = req.maxTokens ?? 0
  if (model?.reasoning === undefined || req.reasoning === undefined) return answer
  return answer + req.reasoning.extraTokens
}

/**
 * Per https://console.groq.com/docs/reasoning (verified 2026-09-09):
 * `reasoning_format` and `include_reasoning` are mutually exclusive, and
 * GPT-OSS accepts only the latter. Models that answer with <think> tags take
 * neither — their reasoning is separated on our side instead.
 */
function reasoningParams(req: ChatRequest, model: ModelSpec | undefined): Record<string, unknown> {
  if (model?.reasoning === undefined) return {}

  const effort =
    model.reasoningEffort === true && req.reasoning !== undefined
      ? { reasoning_effort: req.reasoning.effort }
      : {}

  if (model.reasoning === 'parsed') return { reasoning_format: 'parsed', ...effort }
  if (model.reasoning === 'include') return { include_reasoning: true, ...effort }
  // 'effort' and 'tags' take neither format parameter: sending Groq's spelling
  // to another provider is a 400, not a no-op.
  return effort
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
    return providerErrorMessage(await response.text())
  } catch {
    return '<unreadable body>'
  }
}

/**
 * Providers explain themselves well and then bury it in JSON. Google answers a
 * retired model with an array wrapping `error.message`; OpenAI-shaped providers
 * use an object; Cloudflare uses `errors[]`. Truncating the raw body gave the
 * user a wall of braces cut off mid-sentence, so pull out the sentence instead
 * and fall back to the raw text when the shape is unfamiliar.
 */
export function providerErrorMessage(body: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return body.slice(0, 300)
  }

  const found = messageIn(parsed)
  return (found ?? body).slice(0, 300)
}

function messageIn(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = messageIn(item)
      if (found !== null) return found
    }
    return null
  }
  if (typeof value !== 'object' || value === null) return null

  const record = value as Record<string, unknown>
  if (typeof record.message === 'string' && record.message.length > 0) return record.message
  for (const key of ['error', 'errors', 'detail']) {
    const found = messageIn(record[key])
    if (found !== null) return found
  }
  return null
}
