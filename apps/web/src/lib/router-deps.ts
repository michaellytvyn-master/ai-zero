import {
  CLOUDFLARE_API_ROOT,
  type Transcriber,
  createGroqTranscriber,
  smallestFreeModelId,
  GEMINI_BASE_URL,
  GROQ_BASE_URL,
  createCloudflare,
  createGemini,
  createGroq,
  type Provider,
} from '@zca/providers'
import type { FailoverDeps, ProviderKey } from '@zca/router-core'
import type { UsageEvent } from '@zca/shared'
import { operatorKeys, runtimeConfig } from '../config'
import { PostgresCooldownStore } from './cooldowns'
import { decryptedKeys } from './provider-keys'
import { recordUsage } from './usage'

/**
 * Built here rather than taken from the registry const, so it honours the same
 * base-URL override the chat providers do. Taking the const meant transcription
 * silently ignored it.
 */
export function transcriber(): Transcriber {
  return createGroqTranscriber(process.env.GROQ_BASE_URL ?? GROQ_BASE_URL)
}

/**
 * Rebuilt rather than taken from the registry so each base URL can be pointed
 * at a stub in tests. Every provider in the registry must appear here: one that
 * does not is offered by the model picker and then rejected by the router with
 * "no configured provider serves it", which is what happened when Gemini was
 * added. `router-deps.test.ts` now fails if the two lists diverge.
 */
export function allProviders(): readonly Provider[] {
  return [
    createGroq(process.env.GROQ_BASE_URL ?? GROQ_BASE_URL),
    createCloudflare(process.env.CLOUDFLARE_API_ROOT ?? CLOUDFLARE_API_ROOT),
    createGemini(process.env.GEMINI_BASE_URL ?? GEMINI_BASE_URL),
  ].sort((a, b) => a.priority - b.priority)
}

function operatorKey(provider: Provider): string | null {
  // Cloudflare needs the account id as well as the token, because the account
  // id is part of the URL. The adapter takes them joined by a colon, which is
  // also the form a user pastes into the account panel.
  if (provider.id === 'cloudflare') {
    const accountId = operatorKeys().CF_ACCOUNT_ID?.trim()
    const token = operatorKeys().CF_API_TOKEN?.trim()
    return accountId && token ? `${accountId}:${token}` : null
  }

  const env = operatorKeys() as unknown as Record<string, string | undefined>
  return env[provider.keyEnvVar]?.trim() || null
}

export interface RouterContext {
  readonly deps: FailoverDeps
  /** True when the request runs on the user's own keys and skips the demo cap. */
  readonly usingOwnKeys: boolean
}

/**
 * A user who has added any key of their own runs entirely on their keys and is
 * never charged against the shared demo pool. Mixing the two would make the
 * cap unpredictable: the same prompt could silently spend a demo message just
 * because the user's preferred provider was cooling down.
 */
export async function buildRouterContext(
  userId: string,
  source: UsageEvent['source'],
): Promise<RouterContext> {
  const userKeys = await decryptedKeys(userId)
  // Counted across model providers only. The vault also holds a Cloudinary
  // credential for image storage, and connecting somewhere to keep pictures
  // must not silently take a user off the shared model pool.
  const usingOwnKeys = allProviders().some((provider) => userKeys.has(provider.id))

  const keyFor = (provider: Provider): ProviderKey | null => {
    if (usingOwnKeys) {
      const key = userKeys.get(provider.id)
      return key === undefined ? null : { key, owner: 'user' }
    }
    const key = operatorKey(provider)
    return key === null ? null : { key, owner: 'operator' }
  }

  return {
    usingOwnKeys,
    deps: {
      providers: allProviders(),
      keyFor,
      cooldowns: new PostgresCooldownStore(),
      recordUsage: (event) => recordUsage(userId, { ...event, source }),
      firstTokenTimeoutMs: runtimeConfig().FIRST_TOKEN_TIMEOUT_MS,
      cooldownSeconds: runtimeConfig().PROVIDER_COOLDOWN_SECONDS,
      now: Date.now,
    },
  }
}

/**
 * Hard constraint 2: the shared demo pool runs the smallest model only, so one
 * visitor cannot spend the whole day's allowance on the largest one. A user on
 * their own keys picks whatever they like.
 */
export function effectiveModel(requested: string, usingOwnKeys: boolean): string {
  if (usingOwnKeys) return requested
  const configured = runtimeConfig().DEMO_MODEL
  return configured === 'auto' ? smallestFreeModelId() : configured
}
