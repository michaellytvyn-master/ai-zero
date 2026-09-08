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
