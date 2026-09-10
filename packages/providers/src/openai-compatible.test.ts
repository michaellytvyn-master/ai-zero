import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatChunk, ChatRequest } from '@zca/shared'
import { ProviderHttpError } from './errors'
import { openAICompatibleChat } from './openai-compatible'

const REQUEST: ChatRequest = {
  model: 'test-model',
  messages: [{ role: 'user', content: 'hello' }],
  temperature: null,
  maxTokens: null,
}

function sseResponse(frames: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame))
        controller.close()
      },
    }),
    { status: 200, ...init },
  )
}

function captureFetch(response: () => Response): { body: () => Record<string, unknown> } {
  const calls: RequestInit[] = []
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    calls.push(init)
    return Promise.resolve(response())
  })
  return {
    body: () => JSON.parse(String(calls[0]?.body)) as Record<string, unknown>,
  }
}

async function drain(iterable: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

const chat = (usesStreamOptions = false) =>
  openAICompatibleChat({
    providerId: 'test',
    baseUrl: 'https://api.test.invalid/v1',
    usesStreamOptions,
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the request body', () => {
  /**
   * The bug this guards: React keys were stored on message objects, structural
   * typing let them through unchanged, and Groq rejected the whole request with
   * "property 'id' is unsupported".
   */
  it('sends only role and content, whatever else the caller attached', async () => {
    const captured = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    const polluted = {
      ...REQUEST,
      messages: [
        { role: 'user' as const, content: 'hello', id: 'react-key-1', answeredBy: 'groq' },
        { role: 'assistant' as const, content: 'hi', id: 'react-key-2', createdAt: Date.now() },
      ],
    }

    await drain(chat()(polluted, 'key', new AbortController().signal))

    expect(captured.body().messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])
  })

  it('always streams, and names the model', async () => {
    const captured = captureFetch(() => sseResponse(['data: [DONE]\n\n']))

    await drain(chat()(REQUEST, 'key', new AbortController().signal))

    expect(captured.body()).toMatchObject({ model: 'test-model', stream: true })
  })

  it('omits optional tuning rather than sending nulls', async () => {
    const captured = captureFetch(() => sseResponse(['data: [DONE]\n\n']))

    await drain(chat()(REQUEST, 'key', new AbortController().signal))

    expect(captured.body()).not.toHaveProperty('temperature')
    expect(captured.body()).not.toHaveProperty('max_tokens')
    expect(captured.body()).not.toHaveProperty('stream_options')
  })

  it('passes tuning through in snake_case when it is set', async () => {
    const captured = captureFetch(() => sseResponse(['data: [DONE]\n\n']))

    await drain(
      chat(true)(
        { ...REQUEST, temperature: 0.4, maxTokens: 256 },
        'key',
        new AbortController().signal,
      ),
    )

    expect(captured.body()).toMatchObject({
      temperature: 0.4,
      max_tokens: 256,
      stream_options: { include_usage: true },
    })
  })
})

describe('the response', () => {
  it('yields deltas, usage and a single stop', async () => {
    captureFetch(() =>
      sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'he' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'llo' }, finish_reason: 'stop' }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } })}\n\n`,
        'data: [DONE]\n\n',
      ]),
    )

    const chunks = await drain(chat()(REQUEST, 'key', new AbortController().signal))

    expect(chunks).toEqual([
      { kind: 'delta', content: 'he' },
      { kind: 'delta', content: 'llo' },
      { kind: 'usage', inputTokens: 5, outputTokens: 2 },
      { kind: 'stop', finishReason: 'stop' },
    ])
  })

  it('skips frames it cannot parse instead of killing the stream', async () => {
    captureFetch(() =>
      sseResponse([
        'data: {not json at all\n\n',
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'still here' } }] })}\n\n`,
        'data: [DONE]\n\n',
      ]),
    )

    const chunks = await drain(chat()(REQUEST, 'key', new AbortController().signal))

    expect(chunks).toContainEqual({ kind: 'delta', content: 'still here' })
  })

  it('turns a rejection into a ProviderHttpError carrying retry-after', async () => {
    captureFetch(
      () =>
        new Response('{"error":{"message":"slow down"}}', {
          status: 429,
          headers: { 'retry-after': '17' },
        }),
    )

    const failure = await drain(chat()(REQUEST, 'key', new AbortController().signal)).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(ProviderHttpError)
    expect((failure as ProviderHttpError).status).toBe(429)
    expect((failure as ProviderHttpError).retryAfterSeconds).toBe(17)
  })
})

// ---------------------------------------------------------------------------
// Reasoning models
// ---------------------------------------------------------------------------

const THINKER = (mode: 'parsed' | 'include' | 'tags', effort = false) => [
  {
    id: 'test-model',
    label: 'Test',
    contextWindow: 1000,
    free: true,
    reasoning: mode,
    ...(effort ? { reasoningEffort: true } : {}),
  },
]

const reasoningChat = (models: ReturnType<typeof THINKER>) =>
  openAICompatibleChat({
    providerId: 'test',
    baseUrl: 'https://example.test/v1',
    usesStreamOptions: false,
    models,
  })

const WITH_BUDGET: ChatRequest = {
  ...REQUEST,
  maxTokens: 400,
  reasoning: { extraTokens: 1500, effort: 'low' },
}

describe('reasoning request parameters', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('adds the thinking headroom on top of the answer budget', async () => {
    const fetched = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    await drain(reasoningChat(THINKER('parsed'))(WITH_BUDGET, 'k', new AbortController().signal))
    // Without the headroom the model spends all 400 thinking and the answer
    // never starts, which is the whole bug this guards.
    expect(fetched.body().max_tokens).toBe(1900)
  })

  it('leaves an ordinary model on the answer budget alone', async () => {
    const fetched = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    await drain(reasoningChat([])(WITH_BUDGET, 'k', new AbortController().signal))
    expect(fetched.body().max_tokens).toBe(400)
  })

  it('asks for the parsed format, and never both reasoning parameters at once', async () => {
    const fetched = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    await drain(reasoningChat(THINKER('parsed'))(WITH_BUDGET, 'k', new AbortController().signal))
    const body = fetched.body()
    expect(body.reasoning_format).toBe('parsed')
    // Groq documents the two as mutually exclusive.
    expect(body.include_reasoning).toBeUndefined()
  })

  it('uses include_reasoning for models that only accept it', async () => {
    const fetched = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    await drain(reasoningChat(THINKER('include'))(WITH_BUDGET, 'k', new AbortController().signal))
    const body = fetched.body()
    expect(body.include_reasoning).toBe(true)
    expect(body.reasoning_format).toBeUndefined()
  })

  it('sends the effort dial only where the model accepts it', async () => {
    const without = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    await drain(reasoningChat(THINKER('parsed'))(WITH_BUDGET, 'k', new AbortController().signal))
    expect(without.body().reasoning_effort).toBeUndefined()

    vi.unstubAllGlobals()
    const with_ = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    await drain(
      reasoningChat(THINKER('parsed', true))(WITH_BUDGET, 'k', new AbortController().signal),
    )
    expect(with_.body().reasoning_effort).toBe('low')
  })

  it('sends no reasoning parameters for a tag-based model', async () => {
    const fetched = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    await drain(reasoningChat(THINKER('tags'))(WITH_BUDGET, 'k', new AbortController().signal))
    const body = fetched.body()
    expect(body.reasoning_format).toBeUndefined()
    expect(body.include_reasoning).toBeUndefined()
  })
})

describe('reasoning stream', () => {
  afterEach(() => vi.unstubAllGlobals())

  const frame = (delta: Record<string, string>) =>
    `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`

  it('reports a dedicated reasoning field apart from the answer', async () => {
    captureFetch(() =>
      sseResponse([
        frame({ reasoning: 'weighing' }),
        frame({ content: 'Yes.' }),
        'data: [DONE]\n\n',
      ]),
    )
    const chunks = await drain(
      reasoningChat(THINKER('parsed'))(WITH_BUDGET, 'k', new AbortController().signal),
    )
    expect(chunks).toContainEqual({ kind: 'reasoning', content: 'weighing' })
    expect(chunks).toContainEqual({ kind: 'delta', content: 'Yes.' })
  })

  it('splits <think> tags out of the answer for a tag-based model', async () => {
    captureFetch(() =>
      sseResponse([frame({ content: '<think>hmm</think>Yes.' }), 'data: [DONE]\n\n']),
    )
    const chunks = await drain(
      reasoningChat(THINKER('tags'))(WITH_BUDGET, 'k', new AbortController().signal),
    )
    expect(chunks.filter((c) => c.kind === 'reasoning')).toEqual([
      { kind: 'reasoning', content: 'hmm' },
    ])
    expect(chunks.filter((c) => c.kind === 'delta')).toEqual([{ kind: 'delta', content: 'Yes.' }])
  })

  it('leaves the text of a non-reasoning model untouched, tags and all', async () => {
    // A model quoting HTML must not have its answer silently rewritten.
    captureFetch(() => sseResponse([frame({ content: '<think>literal' }), 'data: [DONE]\n\n']))
    const chunks = await drain(reasoningChat([])(WITH_BUDGET, 'k', new AbortController().signal))
    expect(chunks).toContainEqual({ kind: 'delta', content: '<think>literal' })
  })
})

describe('tool calling', () => {
  afterEach(() => vi.unstubAllGlobals())

  const frame = (delta: unknown) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`

  it('offers the tools on the wire in the shape every provider expects', async () => {
    const fetched = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    await drain(
      chat()(
        {
          ...REQUEST,
          tools: [
            { name: 'click', description: 'Click an element', parameters: { type: 'object' } },
          ],
        },
        'k',
        new AbortController().signal,
      ),
    )
    expect(fetched.body().tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'click',
          description: 'Click an element',
          parameters: { type: 'object' },
        },
      },
    ])
  })

  it('sends no tools field at all when there are none, rather than an empty list', async () => {
    const fetched = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    await drain(chat()({ ...REQUEST, tools: [] }, 'k', new AbortController().signal))
    expect(fetched.body().tools).toBeUndefined()
  })

  it('reassembles a call split across chunks and emits it once, whole', async () => {
    captureFetch(() =>
      sseResponse([
        frame({
          tool_calls: [{ index: 0, id: 'c1', function: { name: 'click', arguments: '{"r' } }],
        }),
        frame({ tool_calls: [{ index: 0, function: { arguments: 'ef":7}' } }] }),
        'data: [DONE]\n\n',
      ]),
    )
    const chunks = await drain(chat()(REQUEST, 'k', new AbortController().signal))
    expect(chunks.filter((chunk) => chunk.kind === 'tool_call')).toEqual([
      { kind: 'tool_call', id: 'c1', name: 'click', args: '{"ref":7}' },
    ])
  })

  it('still delivers the text a model writes alongside a call', async () => {
    captureFetch(() =>
      sseResponse([
        frame({ content: 'Clicking the button.' }),
        frame({
          tool_calls: [{ index: 0, id: 'c1', function: { name: 'click', arguments: '{}' } }],
        }),
        'data: [DONE]\n\n',
      ]),
    )
    const chunks = await drain(chat()(REQUEST, 'k', new AbortController().signal))
    expect(chunks).toContainEqual({ kind: 'delta', content: 'Clicking the button.' })
    expect(chunks.some((chunk) => chunk.kind === 'tool_call')).toBe(true)
  })
})

describe('tool results on the wire', () => {
  afterEach(() => vi.unstubAllGlobals())

  const send = async (messages: ChatRequest['messages']) => {
    const fetched = captureFetch(() => sseResponse(['data: [DONE]\n\n']))
    await drain(chat()({ ...REQUEST, messages }, 'k', new AbortController().signal))
    return fetched.body().messages as Record<string, unknown>[]
  }

  it('replays the assistant turn that asked for a tool, with the call attached', async () => {
    const [message] = await send([
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: 'click', args: '{"ref":3}' }],
      },
    ])
    expect(message).toEqual({
      role: 'assistant',
      // Null, not "": OpenAI-shaped providers reject an empty string here.
      content: null,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'click', arguments: '{"ref":3}' } },
      ],
    })
  })

  it('quotes the call id on the result, without which the result is an orphan', async () => {
    const [message] = await send([{ role: 'tool', content: 'clicked', toolCallId: 'c1' }])
    expect(message).toEqual({ role: 'tool', content: 'clicked', tool_call_id: 'c1' })
  })

  it('leaves an ordinary turn exactly as it was', async () => {
    const [message] = await send([{ role: 'user', content: 'hello' }])
    expect(message).toEqual({ role: 'user', content: 'hello' })
  })

  it('keeps text the assistant wrote alongside its calls', async () => {
    const [message] = await send([
      {
        role: 'assistant',
        content: 'Clicking Search.',
        toolCalls: [{ id: 'c1', name: 'click', args: '{}' }],
      },
    ])
    expect(message?.content).toBe('Clicking Search.')
  })
})
