import { orderedProviders, qualifiedModelIds } from '@zca/providers'
import { AllProvidersFailedError, ProviderAuthError, ProviderFatalError } from './errors'
import { runFailover, type FailoverDeps, type RouterEvent } from './failover'
import {
  chatCompletionRequestSchema,
  chunkPayload,
  completionPayload,
  sseEvent,
  toChatRequest,
} from './wire'

export async function handleChatCompletions(
  request: Request,
  deps: FailoverDeps,
): Promise<Response> {
  const body = await request.json().catch(() => null)
  const parsed = chatCompletionRequestSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'invalid body')
  }

  const events = runFailover(deps, toChatRequest(parsed.data), request.signal)

  // Drain up to the `selected` event before writing a status line, so that a
  // total failover failure is still a real HTTP error rather than a 200 that
  // dies halfway through.
  let selected: Extract<RouterEvent, { kind: 'selected' }>
  try {
    const first = await events.next()
    if (first.done === true || first.value.kind !== 'selected') {
      return errorResponse(503, 'no_provider', 'no provider produced a response')
    }
    selected = first.value
  } catch (error) {
    return failureResponse(error)
  }

  return parsed.data.stream
    ? streamingResponse(events, selected)
    : await bufferedResponse(events, selected)
}

export function handleModels(): Response {
  return Response.json({
    object: 'list',
    data: qualifiedModelIds().map((id) => ({ id, object: 'model', owned_by: id.split(':')[0] })),
  })
}

export function handleHealth(deps: Pick<FailoverDeps, 'keyFor'>): Response {
  return Response.json({
    status: 'ok',
    providers: orderedProviders().map((p) => ({
      id: p.id,
      priority: p.priority,
      configured: deps.keyFor(p) !== null,
    })),
  })
}

function streamingResponse(
  events: AsyncGenerator<RouterEvent>,
  selected: Extract<RouterEvent, { kind: 'selected' }>,
): Response {
  const id = `chatcmpl-${crypto.randomUUID()}`
  const created = Math.floor(Date.now() / 1000)
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text))
      send(sseEvent({ provider: selected.providerId, model: selected.model }, 'provider'))

      try {
        for await (const event of events) {
          if (event.kind === 'delta') {
            send(
              sseEvent(chunkPayload(id, created, selected.model, { content: event.content }, null)),
            )
          } else if (event.kind === 'stop') {
            send(
              sseEvent(chunkPayload(id, created, selected.model, {}, event.finishReason ?? 'stop')),
            )
          } else if (event.kind === 'usage') {
            send(
              sseEvent({
                id,
                object: 'chat.completion.chunk',
                created,
                model: selected.model,
                choices: [],
                usage: {
                  prompt_tokens: event.inputTokens,
                  completion_tokens: event.outputTokens,
                  total_tokens: event.inputTokens + event.outputTokens,
                },
              }),
            )
          }
        }
      } catch (error) {
        // The status line is long gone; the only honest signal left is an
        // in-band error event before [DONE].
        send(sseEvent({ error: { type: 'stream_failed', message: messageOf(error) } }, 'error'))
      }

      send(sseEvent('[DONE]'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-provider': selected.providerId,
    },
  })
}

async function bufferedResponse(
  events: AsyncGenerator<RouterEvent>,
  selected: Extract<RouterEvent, { kind: 'selected' }>,
): Promise<Response> {
  let content = ''
  let finishReason: string | null = null
  let inputTokens = 0
  let outputTokens = 0

  try {
    for await (const event of events) {
      if (event.kind === 'delta') content += event.content
      else if (event.kind === 'stop') finishReason = event.finishReason
      else if (event.kind === 'usage') {
        inputTokens = event.inputTokens
        outputTokens = event.outputTokens
      }
    }
  } catch (error) {
    return failureResponse(error)
  }

  return Response.json(
    completionPayload(
      `chatcmpl-${crypto.randomUUID()}`,
      Math.floor(Date.now() / 1000),
      selected.model,
      selected.providerId,
      content,
      finishReason ?? 'stop',
      inputTokens,
      outputTokens,
    ),
    { headers: { 'x-provider': selected.providerId } },
  )
}

export function failureResponse(error: unknown): Response {
  if (error instanceof ProviderAuthError) {
    return errorResponse(
      401,
      'provider_auth',
      `${error.providerId} rejected the API key. Check that key rather than retrying.`,
    )
  }
  if (error instanceof ProviderFatalError) {
    return errorResponse(502, 'provider_error', `${error.providerId}: ${error.message}`)
  }
  if (error instanceof AllProvidersFailedError) {
    return Response.json(
      {
        error: {
          type: 'no_provider_available',
          message: 'every provider was skipped or failed',
          attempts: error.attempts,
        },
      },
      { status: 503 },
    )
  }
  return errorResponse(500, 'internal_error', messageOf(error))
}

function errorResponse(status: number, type: string, message: string): Response {
  return Response.json({ error: { type, message } }, { status })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
