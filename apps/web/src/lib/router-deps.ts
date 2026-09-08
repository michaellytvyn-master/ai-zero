import {
  CEREBRAS_BASE_URL,
  GROQ_BASE_URL,
  MISTRAL_BASE_URL,
  createCerebras,
  createGroq,
  createMistral,
  type Provider,
} from '@zca/providers'
import type { FailoverDeps, ProviderKey } from '@zca/router-core'
import type { UsageEvent } from '@zca/shared'
import { config } from '../config'
import { PostgresCooldownStore } from './cooldowns'
import { decryptedKeys } from './provider-keys'
import { recordUsage } from './usage'

export function allProviders(): readonly Provider[] {
  return [
    createMistral(process.env['MISTRAL_BASE_URL'] ?? MISTRAL_BASE_URL),
    createGroq(process.env['GROQ_BASE_URL'] ?? GROQ_BASE_URL),
    createCerebras(process.env['CEREBRAS_BASE_URL'] ?? CEREBRAS_BASE_URL),
  ].sort((a, b) => a.priority - b.priority)
}

function operatorKey(provider: Provider): string | null {
  const env = config() as unknown as Record<string, string | undefined>
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
  const usingOwnKeys = userKeys.size > 0

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
      firstTokenTimeoutMs: config().FIRST_TOKEN_TIMEOUT_MS,
      cooldownSeconds: config().PROVIDER_COOLDOWN_SECONDS,
      now: Date.now,
    },
  }
}
