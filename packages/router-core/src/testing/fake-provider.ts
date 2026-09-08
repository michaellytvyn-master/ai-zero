import type { ChatChunk, ChatRequest } from '@zca/shared'
import { classifyThrown, type Provider } from '@zca/providers'

export interface FakeSpec {
  readonly id: string
  readonly priority: number
  readonly models?: readonly string[]
  /** Thrown before the first chunk, so failover is still allowed. */
  readonly failWith?: unknown
  readonly chunks?: readonly ChatChunk[]
  /** Stalls the first chunk, to exercise the first-token timeout. */
  readonly firstChunkDelayMs?: number
  /** Thrown after one chunk has already been yielded. */
  readonly failMidStreamWith?: unknown
}

export interface FakeProvider extends Provider {
  readonly calls: ChatRequest[]
}

const DEFAULT_CHUNKS: readonly ChatChunk[] = [
  { kind: 'delta', content: 'hello' },
  { kind: 'usage', inputTokens: 11, outputTokens: 7 },
  { kind: 'stop', finishReason: 'stop' },
]

export function fakeProvider(spec: FakeSpec): FakeProvider {
  const calls: ChatRequest[] = []
  const modelIds = spec.models ?? ['m1']

  return {
    id: spec.id,
    label: spec.id,
    priority: spec.priority,
    signupUrl: `https://example.test/${spec.id}`,
    keyEnvVar: `${spec.id.toUpperCase()}_API_KEY`,
    termsAllowServingEndUsers: true,
    models: modelIds.map((id) => ({ id, label: id, contextWindow: 4096, free: true })),
    calls,
    async *chat(req: ChatRequest, _key: string, signal: AbortSignal): AsyncIterable<ChatChunk> {
      calls.push(req)
      if (spec.firstChunkDelayMs !== undefined) await sleep(spec.firstChunkDelayMs, signal)
      if (spec.failWith !== undefined) throw spec.failWith

      for (const chunk of spec.chunks ?? DEFAULT_CHUNKS) {
        yield chunk
        if (spec.failMidStreamWith !== undefined) throw spec.failMidStreamWith
      }
    },
    classifyError: classifyThrown,
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        const aborted = new Error('aborted')
        aborted.name = 'AbortError'
        reject(aborted)
      },
      { once: true },
    )
  })
}
