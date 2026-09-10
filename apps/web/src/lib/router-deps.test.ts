import { describe, expect, it } from 'vitest'
import { providers, resolveModel } from '@zca/providers'
import { allProviders } from './router-deps'

/**
 * The web app rebuilds the provider list so tests can point base URLs at a
 * stub. That duplication is the bug this guards: a provider present in the
 * registry but missing here is offered by the model picker and then refused by
 * the router, with an error that blames the model rather than the wiring.
 */
describe('allProviders', () => {
  it('covers every provider in the registry', () => {
    expect(
      allProviders()
        .map((provider) => provider.id)
        .sort(),
    ).toEqual(providers.map((provider) => provider.id).sort())
  })

  it('is sorted by priority, which is the failover order', () => {
    const priorities = allProviders().map((provider) => provider.priority)
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b))
  })

  it('serves every qualified model id the picker can offer', () => {
    for (const provider of providers) {
      for (const model of provider.models) {
        const qualified = `${provider.id}:${model.id}`
        const served = allProviders().some(
          (candidate) => resolveModel(candidate, qualified) !== null,
        )
        expect(served, `${qualified} is offered but unroutable`).toBe(true)
      }
    }
  })
})
