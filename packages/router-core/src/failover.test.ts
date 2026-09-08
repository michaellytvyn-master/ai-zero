import { describe, expect, it } from 'vitest'
import { ProviderHttpError } from '@zca/providers'
import { AllProvidersFailedError, MidStreamError, ProviderAuthError } from './errors'
import { runFailover, type FailoverDeps, type RouterEvent } from './failover'
import { MemoryCooldownStore } from './store'
import { fakeProvider } from './testing/fake-provider'
import {
  REQUEST,
  answeredBy,
  collect,
  harness,
  rateLimited,
  signal,
  textOf,
} from './testing/harness'

describe('runFailover', () => {
  it('moves to the next provider when the first is rate limited', async () => {
    const first = fakeProvider({ id: 'alpha', priority: 1, failWith: rateLimited('alpha') })
    const second = fakeProvider({
      id: 'beta',
      priority: 2,
      chunks: [
        { kind: 'delta', content: 'answer from beta' },
        { kind: 'stop', finishReason: 'stop' },
      ],
    })
    const { deps, cooldowns } = harness([first, second])

    const events = await collect(runFailover(deps, REQUEST, signal()))

    expect(answeredBy(events)).toBe('beta')
    expect(textOf(events)).toBe('answer from beta')
    expect(await cooldowns.isCoolingDown('alpha')).toBe(true)
  })

  it('reports every attempt when all providers are rate limited', async () => {
    const providers = [
      fakeProvider({ id: 'alpha', priority: 1, failWith: rateLimited('alpha') }),
      fakeProvider({ id: 'beta', priority: 2, failWith: rateLimited('beta') }),
    ]
    const { deps } = harness(providers)

    const error = await collect(runFailover(deps, REQUEST, signal())).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AllProvidersFailedError)
    expect((error as AllProvidersFailedError).attempts).toEqual([
      { providerId: 'alpha', reason: 'rate_limit', detail: 'alpha rate limited' },
      { providerId: 'beta', reason: 'rate_limit', detail: 'beta rate limited' },
    ])
  })

  it('stops the chain on an auth error instead of silently skipping', async () => {
    const broken = fakeProvider({
      id: 'alpha',
      priority: 1,
      failWith: new ProviderHttpError('alpha', 401, null, 'invalid api key'),
    })
    const healthy = fakeProvider({ id: 'beta', priority: 2 })
    const { deps } = harness([broken, healthy])

    const error = await collect(runFailover(deps, REQUEST, signal())).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ProviderAuthError)
    expect((error as ProviderAuthError).providerId).toBe('alpha')
    expect(healthy.calls).toHaveLength(0)
  })

  it('skips providers with no key and never calls them', async () => {
    const unconfigured = fakeProvider({ id: 'alpha', priority: 1 })
    const configured = fakeProvider({ id: 'beta', priority: 2 })
    const { deps } = harness([unconfigured, configured], { keyless: ['alpha'] })

    const events = await collect(runFailover(deps, REQUEST, signal()))

    expect(answeredBy(events)).toBe('beta')
    expect(unconfigured.calls).toHaveLength(0)
  })

  it('skips a provider that is still cooling down', async () => {
    const cooling = fakeProvider({ id: 'alpha', priority: 1 })
    const available = fakeProvider({ id: 'beta', priority: 2 })
    const { deps, cooldowns } = harness([cooling, available])
    await cooldowns.startCooldown('alpha', 60)

    const events = await collect(runFailover(deps, REQUEST, signal()))

    expect(answeredBy(events)).toBe('beta')
    expect(cooling.calls).toHaveLength(0)
  })

  it('uses the provider retry-after instead of the default cooldown', async () => {
    let now = 1_000_000
    const cooldowns = new MemoryCooldownStore(() => now)
    const deps: FailoverDeps = {
      providers: [
        fakeProvider({ id: 'alpha', priority: 1, failWith: rateLimited('alpha', 5) }),
        fakeProvider({ id: 'beta', priority: 2 }),
      ],
      keyFor: (p) => ({ key: `key-${p.id}`, owner: 'user' as const }),
      cooldowns,
      recordUsage: async () => {},
      firstTokenTimeoutMs: 5_000,
      cooldownSeconds: 60,
      now: () => now,
    }

    await collect(runFailover(deps, REQUEST, signal()))

    now += 4_000
    expect(await cooldowns.isCoolingDown('alpha')).toBe(true)

    // Past the 5s retry-after but nowhere near the 60s default, so this only
    // passes if the header won.
    now += 2_000
    expect(await cooldowns.isCoolingDown('alpha')).toBe(false)
  })

  it('fails over when the first token does not arrive in time', async () => {
    const slow = fakeProvider({ id: 'alpha', priority: 1, firstChunkDelayMs: 300 })
    const quick = fakeProvider({ id: 'beta', priority: 2 })
    const { deps } = harness([slow, quick], { firstTokenTimeoutMs: 25 })

    const events = await collect(runFailover(deps, REQUEST, signal()))

    expect(answeredBy(events)).toBe('beta')
  })

  it('does not switch provider once the stream has started', async () => {
    const breaksLate = fakeProvider({
      id: 'alpha',
      priority: 1,
      chunks: [{ kind: 'delta', content: 'partial' }],
      failMidStreamWith: new ProviderHttpError('alpha', 500, null, 'died mid-stream'),
    })
    const backup = fakeProvider({ id: 'beta', priority: 2 })
    const { deps } = harness([breaksLate, backup])

    const seen: RouterEvent[] = []
    const error = await (async () => {
      try {
        for await (const event of runFailover(deps, REQUEST, signal())) seen.push(event)
        return null
      } catch (e: unknown) {
        return e
      }
    })()

    expect(error).toBeInstanceOf(MidStreamError)
    expect(textOf(seen)).toBe('partial')
    expect(backup.calls).toHaveLength(0)
  })

  it('skips a provider that does not offer the requested model', async () => {
    const wrongModel = fakeProvider({ id: 'alpha', priority: 1, models: ['only-this'] })
    const rightModel = fakeProvider({ id: 'beta', priority: 2, models: ['wanted'] })
    const { deps } = harness([wrongModel, rightModel])

    const events = await collect(runFailover(deps, { ...REQUEST, model: 'wanted' }, signal()))

    expect(answeredBy(events)).toBe('beta')
    expect(wrongModel.calls).toHaveLength(0)
  })

  it('pins a provider when the model is qualified with a provider id', async () => {
    const alpha = fakeProvider({ id: 'alpha', priority: 1, models: ['shared'] })
    const beta = fakeProvider({ id: 'beta', priority: 2, models: ['shared'] })
    const { deps } = harness([alpha, beta])

    const events = await collect(runFailover(deps, { ...REQUEST, model: 'beta:shared' }, signal()))

    expect(answeredBy(events)).toBe('beta')
    expect(alpha.calls).toHaveLength(0)
  })
})
