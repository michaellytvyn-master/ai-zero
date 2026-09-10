import type { ChatChunk, ChatRequest, UsageEvent } from '@zca/shared'
import { ProviderHttpError, resolveModel, type Provider } from '@zca/providers'
import {
  AllProvidersFailedError,
  MidStreamError,
  ProviderAuthError,
  ProviderFatalError,
  type AttemptRecord,
} from './errors'
import type { CooldownStore } from './store'

export type RouterEvent =
  | { readonly kind: 'selected'; readonly providerId: string; readonly model: string }
  | { readonly kind: 'delta'; readonly content: string }
  | { readonly kind: 'reasoning'; readonly content: string }
  | {
      readonly kind: 'tool_call'
      readonly id: string
      readonly name: string
      readonly args: string
    }
  | { readonly kind: 'usage'; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly kind: 'stop'; readonly finishReason: string | null }

export interface ProviderKey {
  readonly key: string
  readonly owner: 'user' | 'operator'
}

export interface FailoverDeps {
  readonly providers: readonly Provider[]
  readonly keyFor: (provider: Provider) => ProviderKey | null
  readonly cooldowns: CooldownStore
  readonly recordUsage: (event: UsageEvent) => Promise<void>
  readonly firstTokenTimeoutMs: number
  readonly cooldownSeconds: number
  readonly now: () => number
}

export async function* runFailover(
  deps: FailoverDeps,
  request: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<RouterEvent> {
  const attempts: AttemptRecord[] = []

  for (const provider of [...deps.providers].sort((a, b) => a.priority - b.priority)) {
    const model = resolveModel(provider, request.model)
    if (model === null) {
      attempts.push({ providerId: provider.id, reason: 'unsupported_model', detail: request.model })
      continue
    }

    const credential = deps.keyFor(provider)
    if (credential === null) {
      attempts.push({ providerId: provider.id, reason: 'no_key', detail: provider.keyEnvVar })
      continue
    }

    if (await deps.cooldowns.isCoolingDown(provider.id)) {
      attempts.push({ providerId: provider.id, reason: 'cooldown', detail: null })
      continue
    }

    const controller = new AbortController()
    const forwardAbort = () => controller.abort()
    signal.addEventListener('abort', forwardAbort, { once: true })
    const startedAt = deps.now()

    let iterator: AsyncIterator<ChatChunk>
    let first: IteratorResult<ChatChunk>
    try {
      iterator = provider
        .chat({ ...request, model }, credential.key, controller.signal)
        [Symbol.asyncIterator]()
      first = await firstChunkWithin(iterator, deps.firstTokenTimeoutMs, controller)
    } catch (error) {
      signal.removeEventListener('abort', forwardAbort)
      const kind = provider.classifyError(error)
      const detail = messageOf(error)

      if (kind === 'auth') throw new ProviderAuthError(provider.id, detail)
      if (kind === 'fatal') throw new ProviderFatalError(provider.id, detail)
      if (kind === 'rate_limit') {
        await deps.cooldowns.startCooldown(provider.id, cooldownFor(error, deps.cooldownSeconds))
      }
      attempts.push({ providerId: provider.id, reason: kind, detail })
      continue
    }

    // A chunk arrived. From here the client may receive bytes, so the spec
    // forbids switching provider: this attempt either finishes or fails hard.
    yield { kind: 'selected', providerId: provider.id, model }
    yield* stream(
      deps,
      { providerId: provider.id, model, keyOwner: credential.owner },
      iterator,
      first,
      startedAt,
      signal,
      forwardAbort,
    )
    return
  }

  throw new AllProvidersFailedError(attempts)
}

interface Attempt {
  readonly providerId: string
  readonly model: string
  readonly keyOwner: 'user' | 'operator'
}

async function* stream(
  deps: FailoverDeps,
  attempt: Attempt,
  iterator: AsyncIterator<ChatChunk>,
  first: IteratorResult<ChatChunk>,
  startedAt: number,
  signal: AbortSignal,
  forwardAbort: () => void,
): AsyncGenerator<RouterEvent> {
  let inputTokens = 0
  let outputTokens = 0
  let status = 200

  try {
    let result = first
    while (result.done !== true) {
      const chunk = result.value
      if (chunk.kind === 'delta') {
        yield { kind: 'delta', content: chunk.content }
      } else if (chunk.kind === 'reasoning') {
        yield { kind: 'reasoning', content: chunk.content }
      } else if (chunk.kind === 'tool_call') {
        yield { kind: 'tool_call', id: chunk.id, name: chunk.name, args: chunk.args }
      } else if (chunk.kind === 'usage') {
        inputTokens = chunk.inputTokens
        outputTokens = chunk.outputTokens
        yield { kind: 'usage', inputTokens, outputTokens }
      } else {
        yield { kind: 'stop', finishReason: chunk.finishReason }
      }
      result = await iterator.next()
    }
  } catch (error) {
    status = error instanceof ProviderHttpError ? error.status : 500
    throw new MidStreamError(attempt.providerId, messageOf(error))
  } finally {
    signal.removeEventListener('abort', forwardAbort)
    // A failing recorder must never take down a request the user already paid
    // for in latency; usage is telemetry, not part of the contract.
    await deps
      .recordUsage({
        providerId: attempt.providerId,
        model: attempt.model,
        keyOwner: attempt.keyOwner,
        inputTokens,
        outputTokens,
        latencyMs: Math.max(0, Math.round(deps.now() - startedAt)),
        status,
        at: new Date(deps.now()).toISOString(),
        source: 'router',
      })
      .catch(() => {})
  }
}

async function firstChunkWithin(
  iterator: AsyncIterator<ChatChunk>,
  timeoutMs: number,
  controller: AbortController,
): Promise<IteratorResult<ChatChunk>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      const timeout = new Error(`no first token within ${timeoutMs}ms`)
      timeout.name = 'AbortError'
      reject(timeout)
    }, timeoutMs)
  })

  try {
    return await Promise.race([iterator.next(), expiry])
  } finally {
    clearTimeout(timer)
  }
}

function cooldownFor(error: unknown, fallbackSeconds: number): number {
  if (error instanceof ProviderHttpError && error.retryAfterSeconds !== null) {
    return error.retryAfterSeconds
  }
  return fallbackSeconds
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
