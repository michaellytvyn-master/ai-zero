import pricesJson from './prices.json'

export interface ReferenceModel {
  readonly id: string
  readonly label: string
  readonly vendor: string
  readonly inputPerMillionUsd: number
  readonly outputPerMillionUsd: number
  readonly checkedOn: string
  readonly source: string
  readonly why: string
}

export const referenceModels: readonly ReferenceModel[] = pricesJson.models
export const defaultReferenceModelId: string = pricesJson.defaultModelId

export function referenceModel(id: string = defaultReferenceModelId): ReferenceModel {
  const found = referenceModels.find((model) => model.id === id)
  if (found === undefined) {
    throw new Error(`unknown reference model ${id}`)
  }
  return found
}

export interface TokenCounts {
  readonly inputTokens: number
  readonly outputTokens: number
}

/**
 * Micro-dollars (1e-6 USD) as integers. A single request can cost a fraction
 * of a cent, and summing thousands of those as floats drifts; integers do not.
 *
 * cost_usd = tokens / 1e6 * pricePerMillion, so cost in micro-dollars is
 * exactly tokens * pricePerMillion.
 */
export function microUsdFor(counts: TokenCounts, model: ReferenceModel): number {
  const input = counts.inputTokens * model.inputPerMillionUsd
  const output = counts.outputTokens * model.outputPerMillionUsd
  return Math.round(input + output)
}

export interface ProviderTotal {
  readonly providerId: string
  readonly requests: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly microUsd: number
}

export interface Savings {
  readonly modelId: string
  readonly modelLabel: string
  readonly requests: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly microUsd: number
  readonly byProvider: readonly ProviderTotal[]
}

export interface UsageTotal extends TokenCounts {
  readonly providerId: string
  readonly requests: number
}

/** Totals are summed per provider first, so the breakdown always adds up. */
export function savingsFrom(totals: readonly UsageTotal[], model: ReferenceModel): Savings {
  const byProvider = totals.map((total) => ({
    providerId: total.providerId,
    requests: total.requests,
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    microUsd: microUsdFor(total, model),
  }))

  return {
    modelId: model.id,
    modelLabel: model.label,
    requests: sum(byProvider, (row) => row.requests),
    inputTokens: sum(byProvider, (row) => row.inputTokens),
    outputTokens: sum(byProvider, (row) => row.outputTokens),
    microUsd: sum(byProvider, (row) => row.microUsd),
    byProvider: [...byProvider].sort((a, b) => b.microUsd - a.microUsd),
  }
}

/**
 * Small amounts keep more decimals rather than collapsing to $0.00, which
 * would read as "this measured nothing" instead of "this was nearly free".
 */
export function formatUsd(microUsd: number): string {
  const usd = microUsd / 1_000_000
  if (usd === 0) return '$0'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

function sum<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0)
}
