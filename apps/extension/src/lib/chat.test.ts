import { describe, expect, it } from 'vitest'
import { providers } from '@zca/providers'
import { factoryIds } from './chat'

/**
 * The third place this list is duplicated: the router, the website and here.
 * A provider missing from any of them is offered by a picker and then refused
 * or silently skipped, with an error that blames the model rather than the
 * wiring. Twice was enough.
 */
describe('direct-mode provider factories', () => {
  it('covers every provider in the registry', () => {
    expect(factoryIds().sort()).toEqual(providers.map((provider) => provider.id).sort())
  })
})
