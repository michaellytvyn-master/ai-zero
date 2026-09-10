import { describe, expect, it } from 'vitest'
import { runFailover } from './failover'
import { handleChatCompletions } from './handler'
import { fakeProvider } from './testing/fake-provider'
import { REQUEST, harness } from './testing/harness'

const THINKING_CHUNKS = [
  { kind: 'reasoning' as const, content: 'weighing it up' },
  { kind: 'delta' as const, content: 'Yes.' },
  { kind: 'stop' as const, finishReason: 'stop' },
]

describe('reasoning through the router', () => {
  it('forwards reasoning as its own event rather than folding it into the answer', async () => {
    const provider = fakeProvider({ id: 'p1', priority: 1, chunks: THINKING_CHUNKS })
    const { deps } = harness([provider])

    const events = []
    for await (const event of runFailover(deps, REQUEST, new AbortController().signal)) {
      events.push(event)
    }

    expect(events).toContainEqual({ kind: 'reasoning', content: 'weighing it up' })
    expect(events).toContainEqual({ kind: 'delta', content: 'Yes.' })
  })
})

describe('reasoning over the OpenAI-compatible endpoint', () => {
  async function streamText(chunks: typeof THINKING_CHUNKS): Promise<string> {
    const provider = fakeProvider({ id: 'p1', priority: 1, models: ['m1'], chunks })
    const { deps } = harness([provider])
    const response = await handleChatCompletions(
      new Request('https://example.test/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'm1',
          messages: [{ role: 'user', content: 'hi' }],
          stream: true,
        }),
      }),
      deps,
    )
    return await response.text()
  }

  it('puts reasoning in its own delta field, never in content', async () => {
    const body = await streamText(THINKING_CHUNKS)

    const deltas = [...body.matchAll(/^data: (\{.*\})$/gm)]
      .map(
        (match) =>
          JSON.parse(String(match[1])) as { choices?: { delta?: Record<string, string> }[] },
      )
      .flatMap((payload) => payload.choices ?? [])
      .map((choice) => choice.delta ?? {})

    expect(deltas).toContainEqual({ reasoning: 'weighing it up' })
    expect(deltas).toContainEqual({ content: 'Yes.' })
    // The whole point: a client reading only `content` sees the answer alone.
    const answer = deltas.map((delta) => delta.content ?? '').join('')
    expect(answer).toBe('Yes.')
    expect(answer).not.toContain('weighing')
  })
})
