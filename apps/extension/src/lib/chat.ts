import { createCloudflare, createGemini, createGroq, type Provider } from '@zca/providers'
import { MemoryCooldownStore, runFailover, type ProviderKey } from '@zca/router-core'
import type { ChatRequest, ToolSpec } from '@zca/shared'
import {
  type ChatMessage,
  type ResponseMode,
  type UsageEvent,
  applyResponseMode,
  readSse,
} from '@zca/shared'
import { SITE_URL } from './config'
import type { Session } from './session'

/**
 * Direct mode builds its own providers so each base URL comes from the session
 * rather than a constant. Every provider in the registry must have a factory
 * here: one that does not is offered by the picker and then silently skipped,
 * which is exactly how Gemini shipped broken twice. `chat.test.ts` fails if the
 * two ever diverge again.
 */
const FACTORIES: Record<string, (baseUrl: string) => Provider> = {
  groq: createGroq,
  cloudflare: createCloudflare,
  gemini: createGemini,
}

export function factoryIds(): string[] {
  return Object.keys(FACTORIES)
}

const cooldowns = new MemoryCooldownStore()

export type ChatEvent =
  | { readonly kind: 'provider'; readonly providerId: string; readonly model: string }
  | { readonly kind: 'delta'; readonly content: string }
  | { readonly kind: 'reasoning'; readonly content: string }
  | {
      readonly kind: 'tool_call'
      readonly id: string
      readonly name: string
      readonly args: string
    }
  | { readonly kind: 'exhausted'; readonly signupUrls: { label: string; url: string }[] }
  | { readonly kind: 'error'; readonly message: string }

export function usesOwnKeys(session: Session): boolean {
  return session.providers.some((provider) => provider.key !== null)
}

export async function* streamChat(
  session: Session,
  messages: readonly ChatMessage[],
  model: string,
  mode: ResponseMode,
  signal: AbortSignal,
  tools?: readonly ToolSpec[],
): AsyncGenerator<ChatEvent> {
  const request = applyResponseMode(
    {
      model,
      messages,
      temperature: null,
      maxTokens: null,
      ...(tools === undefined || tools.length === 0 ? {} : { tools }),
    },
    mode,
  )
  if (usesOwnKeys(session)) yield* streamDirect(session, request, signal)
  else yield* streamViaRouter(session, request, signal)
}

/**
 * BYOK: the request goes straight to the provider from this extension, so it
 * keeps working while our server is down. Same failover engine the server
 * runs, so behaviour does not diverge between the two paths.
 */
async function* streamDirect(
  session: Session,
  request: ChatRequest,
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
    request,
    signal,
  )

  try {
    for await (const event of events) {
      if (event.kind === 'selected') {
        yield { kind: 'provider', providerId: event.providerId, model: event.model }
      } else if (event.kind === 'delta') {
        yield { kind: 'delta', content: event.content }
      } else if (event.kind === 'reasoning') {
        yield { kind: 'reasoning', content: event.content }
      } else if (event.kind === 'tool_call') {
        yield { kind: 'tool_call', id: event.id, name: event.name, args: event.args }
      }
    }
  } catch (error) {
    yield { kind: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

async function* streamViaRouter(
  session: Session,
  request: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const response = await fetch(`${SITE_URL}/api/v1/chat/completions`, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    // max_tokens and messages are both standard, so the router needs no
    // special case for response modes.
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      stream: true,
    }),
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
      const first = (choices[0] as { delta?: { content?: string; reasoning?: string } } | undefined)
        ?.delta
      const thought = first?.reasoning
      if (typeof thought === 'string' && thought.length > 0) {
        yield { kind: 'reasoning', content: thought }
      }
      const delta = first?.content
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
