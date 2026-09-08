import { createCloudflare, createGroq, type Provider } from '@zca/providers'
import { MemoryCooldownStore, runFailover, type ProviderKey } from '@zca/router-core'
import { readSse, type ChatMessage, type UsageEvent } from '@zca/shared'
import { SITE_URL } from './config'
import type { Session } from './session'

const FACTORIES: Record<string, (baseUrl: string) => Provider> = {
  groq: createGroq,
  cloudflare: createCloudflare,
}

const cooldowns = new MemoryCooldownStore()

export type ChatEvent =
  | { readonly kind: 'provider'; readonly providerId: string; readonly model: string }
  | { readonly kind: 'delta'; readonly content: string }
  | { readonly kind: 'exhausted'; readonly signupUrls: { label: string; url: string }[] }
  | { readonly kind: 'error'; readonly message: string }

export function usesOwnKeys(session: Session): boolean {
  return session.providers.some((provider) => provider.key !== null)
}

export async function* streamChat(
  session: Session,
  messages: readonly ChatMessage[],
  model: string,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  if (usesOwnKeys(session)) yield* streamDirect(session, messages, model, signal)
  else yield* streamViaRouter(session, messages, model, signal)
}

/**
 * BYOK: the request goes straight to the provider from this extension, so it
 * keeps working while our server is down. Same failover engine the server
 * runs, so behaviour does not diverge between the two paths.
 */
async function* streamDirect(
  session: Session,
  messages: readonly ChatMessage[],
  model: string,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const keyed = session.providers.filter((provider) => provider.key !== null)
  const providers = keyed.flatMap((info) => {
    const factory = FACTORIES[info.id]
    return factory === undefined ? [] : [factory(info.baseUrl)]
  })

  const keyFor = (provider: Provider): ProviderKey | null => {
    const key = keyed.find((info) => info.id === provider.id)?.key
    return key === undefined || key === null ? null : { key, owner: 'user' }
  }

  const events = runFailover(
    {
      providers,
      keyFor,
      cooldowns,
      recordUsage: (event) => reportUsage(session, event),
      firstTokenTimeoutMs: 8000,
      cooldownSeconds: 60,
      now: Date.now,
    },
    { model, messages, temperature: null, maxTokens: null },
    signal,
  )

  try {
    for await (const event of events) {
      if (event.kind === 'selected') {
        yield { kind: 'provider', providerId: event.providerId, model: event.model }
      } else if (event.kind === 'delta') {
        yield { kind: 'delta', content: event.content }
      }
    }
  } catch (error) {
    yield { kind: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

async function* streamViaRouter(
  session: Session,
  messages: readonly ChatMessage[],
  model: string,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const response = await fetch(`${SITE_URL}/api/v1/chat/completions`, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  })

  if (!response.ok || response.body === null) {
    const body = (await response.json().catch(() => null)) as {
      error?: {
        type?: string
        message?: string
        addYourOwnKey?: { label: string; signupUrl: string }[]
      }
    } | null

    if (body?.error?.type === 'demo_exhausted') {
      yield {
        kind: 'exhausted',
        signupUrls: (body.error.addYourOwnKey ?? []).map((item) => ({
          label: item.label,
          url: item.signupUrl,
        })),
      }
      return
    }
    yield { kind: 'error', message: body?.error?.message ?? `request failed (${response.status})` }
    return
  }

  for await (const frame of readSse(response.body)) {
    if (frame.name === 'provider') {
      yield {
        kind: 'provider',
        providerId: String(frame.data.provider),
        model: String(frame.data.model),
      }
    } else {
      const choices = frame.data.choices
      if (!Array.isArray(choices)) continue
      const delta = (choices[0] as { delta?: { content?: string } } | undefined)?.delta?.content
      if (typeof delta === 'string' && delta.length > 0) yield { kind: 'delta', content: delta }
    }
  }
}

/** Metadata only, and best effort: telemetry must never break a reply. */
async function reportUsage(session: Session, event: UsageEvent): Promise<void> {
  await fetch(`${SITE_URL}/api/usage`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      providerId: event.providerId,
      model: event.model,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      latencyMs: event.latencyMs,
      status: event.status,
    }),
  }).catch(() => undefined)
}
