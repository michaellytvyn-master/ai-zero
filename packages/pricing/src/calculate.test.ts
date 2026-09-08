import { describe, expect, it } from 'vitest'
import {
  defaultReferenceModelId,
  formatUsd,
  microUsdFor,
  referenceModel,
  referenceModels,
  savingsFrom,
} from './calculate'

const model = referenceModel('gpt-5-mini')

describe('microUsdFor', () => {
  it('prices a million tokens at exactly the quoted rate', () => {
    expect(microUsdFor({ inputTokens: 1_000_000, outputTokens: 0 }, model)).toBe(250_000)
    expect(microUsdFor({ inputTokens: 0, outputTokens: 1_000_000 }, model)).toBe(2_000_000)
  })

  it('charges input and output separately', () => {
    // 1000 * 0.25 + 500 * 2.00 = 250 + 1000 micro-dollars
    expect(microUsdFor({ inputTokens: 1000, outputTokens: 500 }, model)).toBe(1250)
  })

  it('is zero for an empty request', () => {
    expect(microUsdFor({ inputTokens: 0, outputTokens: 0 }, model)).toBe(0)
  })

  it('does not drift when thousands of small requests are summed', () => {
    const one = microUsdFor({ inputTokens: 37, outputTokens: 11 }, model)
    let total = 0
    for (let i = 0; i < 10_000; i += 1) total += one

    expect(total).toBe(one * 10_000)
    expect(Number.isInteger(total)).toBe(true)
  })

  it('scales with the reference model', () => {
    const counts = { inputTokens: 1_000_000, outputTokens: 1_000_000 }
    const mini = microUsdFor(counts, referenceModel('gpt-5-mini'))
    const flagship = microUsdFor(counts, referenceModel('gpt-5.5'))

    expect(flagship).toBeGreaterThan(mini)
    expect(flagship).toBe(35_000_000)
  })
})

describe('savingsFrom', () => {
  const totals = [
    { providerId: 'groq', requests: 3, inputTokens: 3000, outputTokens: 1500 },
    { providerId: 'mistral', requests: 1, inputTokens: 1000, outputTokens: 500 },
  ]

  it('adds the per-provider figures up to the headline total', () => {
    const savings = savingsFrom(totals, model)

    expect(savings.requests).toBe(4)
    expect(savings.inputTokens).toBe(4000)
    expect(savings.outputTokens).toBe(2000)
    expect(savings.byProvider.reduce((sum, row) => sum + row.microUsd, 0)).toBe(savings.microUsd)
  })

  it('orders the breakdown by what each provider saved', () => {
    expect(savingsFrom(totals, model).byProvider.map((row) => row.providerId)).toEqual([
      'groq',
      'mistral',
    ])
  })

  it('reports zeroes rather than failing when nothing has been used', () => {
    const empty = savingsFrom([], model)

    expect(empty.microUsd).toBe(0)
    expect(empty.requests).toBe(0)
    expect(empty.byProvider).toEqual([])
  })

  it('names the model the estimate is based on, so the UI cannot mislabel it', () => {
    expect(savingsFrom(totals, model).modelLabel).toBe('GPT-5 mini')
  })
})

describe('formatUsd', () => {
  it('keeps decimals on tiny amounts instead of collapsing to $0.00', () => {
    expect(formatUsd(1250)).toBe('$0.0013')
    expect(formatUsd(50_000)).toBe('$0.050')
    expect(formatUsd(0)).toBe('$0')
  })

  it('uses cents once the amount is a dollar or more', () => {
    expect(formatUsd(1_500_000)).toBe('$1.50')
    expect(formatUsd(35_000_000)).toBe('$35.00')
  })
})

describe('the price table itself', () => {
  it('stamps every entry with a date and a source, per SPEC.md section 8', () => {
    for (const entry of referenceModels) {
      expect(entry.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.source).toMatch(/^https:\/\//)
      expect(entry.inputPerMillionUsd).toBeGreaterThan(0)
      expect(entry.outputPerMillionUsd).toBeGreaterThan(0)
    }
  })

  /**
   * Guards the honesty of the headline figure: defaulting to an expensive
   * model would inflate every user's "saved" number without measuring
   * anything different.
   */
  it('defaults to the cheapest reference model', () => {
    const cheapest = [...referenceModels].sort(
      (a, b) =>
        a.inputPerMillionUsd +
        a.outputPerMillionUsd -
        (b.inputPerMillionUsd + b.outputPerMillionUsd),
    )[0]

    expect(defaultReferenceModelId).toBe(cheapest?.id)
  })

  it('rejects a model it does not know', () => {
    expect(() => referenceModel('not-a-model')).toThrow()
  })
})
