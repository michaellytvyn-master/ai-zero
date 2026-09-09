import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderHttpError } from './errors'
import { fetchLiveModels, mergeLiveModels } from './catalogue'

const signal = () => new AbortController().signal
const stub = (response: Response) => vi.stubGlobal('fetch', () => Promise.resolve(response))
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchLiveModels', () => {
  it('reads the context window a provider reports for itself', async () => {
    stub(
      json({
        data: [{ id: 'openai/gpt-oss-120b', context_window: 131072, max_completion_tokens: 65536 }],
      }),
    )

    expect(await fetchLiveModels('https://api.test/v1', 'k', signal())).toEqual([
      { id: 'openai/gpt-oss-120b', contextWindow: 131072, maxCompletionTokens: 65536 },
    ])
  })

  it('leaves the figures null when a provider does not report them', async () => {
    stub(json({ data: [{ id: 'plain' }] }))

    expect(await fetchLiveModels('https://api.test/v1', 'k', signal())).toEqual([
      { id: 'plain', contextWindow: null, maxCompletionTokens: null },
    ])
  })

  it('skips models the provider has switched off', async () => {
    stub(
      json({
        data: [
          { id: 'retired', active: false },
          { id: 'current', active: true },
        ],
      }),
    )

    const models = await fetchLiveModels('https://api.test/v1', 'k', signal())
    expect(models.map((model) => model.id)).toEqual(['current'])
  })

  it('returns nothing rather than throwing on an unfamiliar shape', async () => {
    stub(json({ something: 'else' }))
    expect(await fetchLiveModels('https://api.test/v1', 'k', signal())).toEqual([])
  })

  it('surfaces a refusal as the error the rest of the code already handles', async () => {
    stub(new Response('nope', { status: 401 }))

    await expect(fetchLiveModels('https://api.test/v1', 'k', signal())).rejects.toBeInstanceOf(
      ProviderHttpError,
    )
  })
})

describe('mergeLiveModels', () => {
  const known = [
    { id: 'a', contextWindow: 8192, free: true },
    { id: 'b', contextWindow: 4096, free: true },
  ]

  it('replaces a recorded figure with the live one', () => {
    const merged = mergeLiveModels(known, [
      { id: 'a', contextWindow: 131072, maxCompletionTokens: null },
    ])

    expect(merged[0]?.contextWindow).toBe(131072)
    expect(merged[1]?.contextWindow).toBe(4096)
  })

  /**
   * The catalogue lists everything a key can reach, including paid models. The
   * registry is the list that is free, and that distinction is load-bearing.
   */
  it('never adds a model the registry does not ship', () => {
    const merged = mergeLiveModels(known, [
      { id: 'a', contextWindow: 100, maxCompletionTokens: null },
      { id: 'expensive-paid-model', contextWindow: 200000, maxCompletionTokens: null },
    ])

    expect(merged.map((model) => model.id)).toEqual(['a', 'b'])
  })

  it('keeps every other field, so free stays free', () => {
    const merged = mergeLiveModels(known, [
      { id: 'a', contextWindow: 1, maxCompletionTokens: null },
    ])
    expect(merged[0]?.free).toBe(true)
  })

  it('leaves everything alone when nothing came back', () => {
    expect(mergeLiveModels(known, [])).toEqual(known)
  })
})
