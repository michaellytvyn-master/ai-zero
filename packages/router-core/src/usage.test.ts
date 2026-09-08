import { describe, expect, it } from 'vitest'
import { ProviderHttpError } from '@zca/providers'
import { runFailover } from './failover'
import { fakeProvider } from './testing/fake-provider'
import { REQUEST, collect, harness, signal } from './testing/harness'

describe('usage recording', () => {
  it('records token counts and latency for a completed request', async () => {
    const provider = fakeProvider({ id: 'alpha', priority: 1 })
    const { deps, recorded } = harness([provider])

    await collect(runFailover(deps, REQUEST, signal()))

    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      providerId: 'alpha',
      model: 'm1',
      inputTokens: 11,
      outputTokens: 7,
      status: 200,
      source: 'router',
    })
  })

  it('carries no prompt or response content, only the fields constraint 3 allows', async () => {
    const provider = fakeProvider({
      id: 'alpha',
      priority: 1,
      chunks: [
        { kind: 'delta', content: 'a very secret answer' },
        { kind: 'stop', finishReason: 'stop' },
      ],
    })
    const { deps, recorded } = harness([provider])

    await collect(runFailover(deps, REQUEST, signal()))

    expect(Object.keys(recorded[0] ?? {}).sort()).toEqual([
      'at',
      'inputTokens',
      'latencyMs',
      'model',
      'outputTokens',
      'providerId',
      'source',
      'status',
    ])
    expect(JSON.stringify(recorded)).not.toContain('secret')
  })

  it('still records usage when the stream dies part way through', async () => {
    const provider = fakeProvider({
      id: 'alpha',
      priority: 1,
      chunks: [{ kind: 'delta', content: 'partial' }],
      failMidStreamWith: new ProviderHttpError('alpha', 500, null, 'boom'),
    })
    const { deps, recorded } = harness([provider])

    await collect(runFailover(deps, REQUEST, signal())).catch(() => undefined)

    expect(recorded).toHaveLength(1)
    expect(recorded[0]?.status).toBe(500)
  })
})
