import { readSse } from '@zca/shared'

export interface SignupOption {
  readonly providerId: string
  readonly label: string
  readonly signupUrl: string
}

export interface ReadPage {
  readonly url: string
  readonly title: string
  readonly ok: boolean
  readonly note: string
}

export interface StreamHandlers {
  /** The conversation this landed in, who answered, and what was read first. */
  onMeta(meta: { conversationId: string; provider: string; model: string; pages: ReadPage[] }): void
  onDelta(chunk: string): void
  /** The model's working-out, shown apart from the answer and never stored. */
  onReasoning(chunk: string): void
  /**
   * Something went wrong after the reply had started — the provider stopped,
   * or the reply could not be saved. Shown beside the answer, never in place of
   * it: what arrived is still worth reading.
   */
  onNotice(message: string): void
  onExhausted(options: SignupOption[]): void
  onFailed(message: string): void
}

export interface ChatRequestBody {
  readonly content: string
  readonly model: string
  readonly mode: string
  readonly conversationId: string | null
  readonly searchWeb: boolean
  readonly attached: string | null
}

/**
 * Posts one turn and drives the callbacks until the stream ends. Split out of
 * the component so it stays about rendering, and so failure handling lives in
 * one place rather than being interleaved with state updates.
 */
export async function streamChatTurn(
  body: ChatRequestBody,
  handlers: StreamHandlers,
): Promise<void> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: body.content,
      model: body.model,
      mode: body.mode,
      searchWeb: body.searchWeb,
      ...(body.attached !== null && { attached: body.attached }),
      ...(body.conversationId !== null && { conversationId: body.conversationId }),
    }),
  })

  if (!response.ok || response.body === null) {
    const failure = (await response.json().catch(() => null)) as {
      error?: { type?: string; message?: string; addYourOwnKey?: SignupOption[] }
    } | null

    if (failure?.error?.type === 'demo_exhausted') {
      handlers.onExhausted(failure.error.addYourOwnKey ?? [])
    } else {
      handlers.onFailed(failure?.error?.message ?? 'Something went wrong.')
    }
    return
  }

  for await (const event of readSse(response.body)) {
    if (event.name === 'meta') {
      handlers.onMeta({
        conversationId: String(event.data.conversationId),
        provider: String(event.data.provider),
        model: String(event.data.model),
        pages: Array.isArray(event.data.pages) ? (event.data.pages as ReadPage[]) : [],
      })
    } else if (event.name === 'delta') {
      handlers.onDelta(String(event.data.content))
    } else if (event.name === 'reasoning') {
      handlers.onReasoning(String(event.data.content))
    } else if (event.name === 'error') {
      handlers.onNotice(String(event.data.message ?? 'Something went wrong part way through.'))
    }
  }
}
