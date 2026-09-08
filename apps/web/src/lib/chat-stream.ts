import { readSse } from '@zca/shared'

export interface SignupOption {
  readonly providerId: string
  readonly label: string
  readonly signupUrl: string
}

export interface StreamHandlers {
  /** The conversation this landed in, and who actually answered. */
  onMeta(meta: { conversationId: string; provider: string; model: string }): void
  onDelta(chunk: string): void
  onExhausted(options: SignupOption[]): void
  onFailed(message: string): void
}

export interface ChatRequestBody {
  readonly content: string
  readonly model: string
  readonly mode: string
  readonly conversationId: string | null
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
      })
    } else if (event.name === 'delta') {
      handlers.onDelta(String(event.data.content))
    }
  }
}
