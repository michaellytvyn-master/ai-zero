import { z } from 'zod'
import { failureResponse, runFailover, type RouterEvent } from '@zca/router-core'
import { UnauthenticatedError, requireUser } from '@/auth'
import { config } from '@/config'
import {
  appendMessage,
  createConversation,
  loadConversation,
  toChatMessages,
} from '@/lib/conversations'
import { buildRouterContext } from '@/lib/router-deps'
import { demoExhaustedResponse, unauthenticatedResponse } from '@/lib/responses'
import { claimDemoMessage } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().min(1).max(32_000),
  model: z.string().min(1).default('auto'),
})

/** The app's own chat: same failover, but the conversation is persisted. */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser()
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json(
        { error: { type: 'invalid_request', message: parsed.error.issues[0]?.message } },
        { status: 400 },
      )
    }

    const { conversationId, history } = await resolveConversation(user.id, parsed.data)
    if (conversationId === null) {
      return Response.json({ error: { type: 'not_found' } }, { status: 404 })
    }

    const { deps, usingOwnKeys } = await buildRouterContext(user.id, 'router')
    if (!usingOwnKeys) {
      const allowance = await claimDemoMessage(user.id)
      if (!allowance.allowed) {
        return demoExhaustedResponse(config().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY)
      }
    }

    await appendMessage(conversationId, { role: 'user', content: parsed.data.content })

    const events = runFailover(
      deps,
      {
        model: parsed.data.model,
        messages: [...history, { role: 'user', content: parsed.data.content }],
        temperature: null,
        maxTokens: null,
      },
      request.signal,
    )

    let selected: Extract<RouterEvent, { kind: 'selected' }>
    try {
      const first = await events.next()
      if (first.done === true || first.value.kind !== 'selected') {
        return Response.json({ error: { type: 'no_provider_available' } }, { status: 503 })
      }
      selected = first.value
    } catch (error) {
      return failureResponse(error)
    }

    return streamAndPersist(events, selected, conversationId)
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticatedResponse()
    throw error
  }
}

async function resolveConversation(
  userId: string,
  input: z.infer<typeof schema>,
): Promise<{ conversationId: string | null; history: ReturnType<typeof toChatMessages> }> {
  if (input.conversationId === undefined) {
    return { conversationId: await createConversation(userId, input.content), history: [] }
  }
  const loaded = await loadConversation(userId, input.conversationId)
  if (loaded === null) return { conversationId: null, history: [] }
  return { conversationId: input.conversationId, history: toChatMessages(loaded.messages) }
}

function streamAndPersist(
  events: AsyncGenerator<RouterEvent>,
  selected: Extract<RouterEvent, { kind: 'selected' }>,
  conversationId: string,
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))

      send('meta', {
        conversationId,
        provider: selected.providerId,
        model: selected.model,
      })

      let answer = ''
      try {
        for await (const event of events) {
          if (event.kind === 'delta') {
            answer += event.content
            send('delta', { content: event.content })
          } else if (event.kind === 'usage') {
            send('usage', { inputTokens: event.inputTokens, outputTokens: event.outputTokens })
          }
        }
      } catch {
        send('error', { message: 'the provider stopped part way through' })
      }

      // Persist whatever arrived: a truncated answer is still the user's
      // history, and losing it would be worse than showing it cut short.
      if (answer.length > 0) {
        await appendMessage(conversationId, {
          role: 'assistant',
          content: answer,
          providerId: selected.providerId,
          model: selected.model,
        }).catch(() => {})
      }

      send('done', { conversationId })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-provider': selected.providerId,
    },
  })
}
