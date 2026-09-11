import { z } from 'zod'
import { failureResponse, runFailover, type RouterEvent } from '@zca/router-core'
import { applyResponseMode, responseMode } from '@zca/shared'
import { SEARCH_MODEL, readLinkedPages } from '@/lib/web-context'
import { UnauthenticatedError, requireUser } from '@/auth'
import { runtimeConfig } from '@/config'
import { type ContentStore, contentStoreFor } from '@/lib/content-store'
import { toChatMessages } from '@/lib/conversations'
import { UserDatabaseError } from '@/lib/user-database'
import { buildRouterContext, effectiveModel } from '@/lib/router-deps'
import {
  demoExhaustedResponse,
  unauthenticatedResponse,
  userDatabaseUnavailableResponse,
} from '@/lib/responses'
import { claimDemoMessage } from '@/lib/usage'
import { claimRequestSlot, tooManyRequests } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().min(1).max(32_000),
  model: z.string().min(1).default('auto'),
  mode: z.string().optional(),
  /** Routes the turn to a model that can search, rather than guessing. */
  searchWeb: z.boolean().default(false),
  /** Text of files the user attached, already extracted in their browser. */
  attached: z.string().max(64_000).optional(),
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

    // Applies whoever the keys belong to. Provider quotas are per organisation,
    // so many users cost nothing — but one runaway client would make this
    // server's egress look abusive to everyone sharing it. Claimed before the
    // user's own database is touched, too: a database that does not answer
    // holds each request for the length of a connection timeout.
    const slot = await claimRequestSlot(user.id)
    if (!slot.allowed) return tooManyRequests(slot)

    // Before any allowance is spent: if the user's own database cannot be
    // reached, say so now, not after a model has answered into nowhere.
    const store = await contentStoreFor(user.id)
    const { conversationId, history } = await resolveConversation(store, parsed.data)
    if (conversationId === null) {
      return Response.json({ error: { type: 'not_found' } }, { status: 404 })
    }

    const { deps, usingOwnKeys } = await buildRouterContext(user.id, 'router')
    if (!usingOwnKeys) {
      const allowance = await claimDemoMessage(user.id)
      if (!allowance.allowed) {
        return demoExhaustedResponse(runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY)
      }
    }

    await store.append(conversationId, { role: 'user', content: parsed.data.content })

    // Models cannot browse. A link in the question is read here and handed over
    // as material; a request to search goes to the one model that can.
    const web = await readLinkedPages(parsed.data.content)
    // Searching costs the operator more than a plain answer and runs on a model
    // with a lower daily ceiling, so on the shared pool hard constraint 2 still
    // wins: the smallest model, whatever was asked for.
    const searching = parsed.data.searchWeb && usingOwnKeys
    const requested = searching ? SEARCH_MODEL : effectiveModel(parsed.data.model, usingOwnKeys)

    const events = runFailover(
      deps,
      applyResponseMode(
        {
          model: requested,
          messages: [
            ...(web.message === null ? [] : [{ role: 'system' as const, content: web.message }]),
            ...history,
            { role: 'user' as const, content: parsed.data.content },
          ],
          temperature: null,
          maxTokens: null,
        },
        responseMode(parsed.data.mode).id,
      ),
      request.signal,
    )

    let selected: Extract<RouterEvent, { kind: 'selected' }>
    try {
      const first = await events.next()
      if (first.done === true || first.value.kind !== 'selected') {
        return Response.json(
          {
            error: {
              type: 'no_provider_available',
              message: 'No provider answered. Check your keys in Settings, under Provider keys.',
            },
          },
          { status: 503 },
        )
      }
      selected = first.value
    } catch (error) {
      return failureResponse(error)
    }

    return streamAndPersist(events, selected, conversationId, web.pages, store)
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticatedResponse()
    if (error instanceof UserDatabaseError)
      return userDatabaseUnavailableResponse(error.userMessage)
    throw error
  }
}

async function resolveConversation(
  store: ContentStore,
  input: z.infer<typeof schema>,
): Promise<{ conversationId: string | null; history: ReturnType<typeof toChatMessages> }> {
  if (input.conversationId === undefined) {
    return { conversationId: await store.create(input.content), history: [] }
  }
  const loaded = await store.load(input.conversationId)
  if (loaded === null) return { conversationId: null, history: [] }
  return { conversationId: input.conversationId, history: toChatMessages(loaded.messages) }
}

function streamAndPersist(
  events: AsyncGenerator<RouterEvent>,
  selected: Extract<RouterEvent, { kind: 'selected' }>,
  conversationId: string,
  pages: { url: string; title: string; ok: boolean; note: string }[],
  store: ContentStore,
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
        pages,
      })

      let answer = ''
      try {
        for await (const event of events) {
          if (event.kind === 'delta') {
            answer += event.content
            send('delta', { content: event.content })
          } else if (event.kind === 'reasoning') {
            // Streamed so the user can watch it, but never stored: it is the
            // model's scratch work, and feeding it back as history would spend
            // context on it on every later turn.
            send('reasoning', { content: event.content })
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
        await store
          .append(conversationId, {
            role: 'assistant',
            content: answer,
            providerId: selected.providerId,
            model: selected.model,
          })
          .catch((error: unknown) => {
            // The reply reached the user; only saving it failed. Say so, rather
            // than let them find the gap in their history later.
            send('error', {
              message:
                error instanceof UserDatabaseError
                  ? error.userMessage
                  : 'The reply was shown but could not be saved.',
            })
          })
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
