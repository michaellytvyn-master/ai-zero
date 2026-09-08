import type { UsageEvent } from '@zca/shared'
import { ProviderHttpError } from '@zca/providers'
import type { FailoverDeps, RouterEvent } from '../failover'
import { MemoryCooldownStore } from '../store'
import type { FakeProvider } from './fake-provider'

export const REQUEST = {
  model: 'auto',
  messages: [{ role: 'user' as const, content: 'hi' }],
  temperature: null,
  maxTokens: null,
}

export interface Harness {
  readonly deps: FailoverDeps
  readonly recorded: UsageEvent[]
  readonly cooldowns: MemoryCooldownStore
}

export function harness(
  providers: readonly FakeProvider[],
  options: { keyless?: readonly string[]; firstTokenTimeoutMs?: number } = {},
): Harness {
  const recorded: UsageEvent[] = []
  const cooldowns = new MemoryCooldownStore()
  const keyless = new Set(options.keyless ?? [])

  return {
    recorded,
    cooldowns,
    deps: {
      providers,
      keyFor: (provider) =>
        keyless.has(provider.id) ? null : { key: `key-${provider.id}`, owner: 'user' as const },
      cooldowns,
      recordUsage: async (event) => {
        recorded.push(event)
      },
      firstTokenTimeoutMs: options.firstTokenTimeoutMs ?? 5_000,
      cooldownSeconds: 60,
      now: () => Date.now(),
    },
  }
}

export async function collect(events: AsyncGenerator<RouterEvent>): Promise<RouterEvent[]> {
  const seen: RouterEvent[] = []
  for await (const event of events) seen.push(event)
  return seen
}

export const textOf = (events: readonly RouterEvent[]): string =>
  events.flatMap((e) => (e.kind === 'delta' ? [e.content] : [])).join('')

export const answeredBy = (events: readonly RouterEvent[]): string | undefined =>
  events.flatMap((e) => (e.kind === 'selected' ? [e.providerId] : []))[0]

export const signal = () => new AbortController().signal
export const rateLimited = (id: string, retryAfter: number | null = null) =>
  new ProviderHttpError(id, 429, retryAfter, `${id} rate limited`)
