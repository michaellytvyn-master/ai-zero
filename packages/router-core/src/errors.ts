export type AttemptReason = 'no_key' | 'cooldown' | 'unsupported_model' | 'rate_limit' | 'transient'

export interface AttemptRecord {
  readonly providerId: string
  readonly reason: AttemptReason
  readonly detail: string | null
}

/** A key is wrong. Never silently skipped: the user has to know. */
export class ProviderAuthError extends Error {
  constructor(
    readonly providerId: string,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderAuthError'
  }
}

export class ProviderFatalError extends Error {
  constructor(
    readonly providerId: string,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderFatalError'
  }
}

export class AllProvidersFailedError extends Error {
  constructor(readonly attempts: readonly AttemptRecord[]) {
    super(explainAttempts(attempts))
    this.name = 'AllProvidersFailedError'
  }
}

/**
 * Turns the attempt log into something a person can act on. The records
 * already said exactly why each provider was passed over; only the message
 * threw that away, leaving "every provider was skipped or failed" as the whole
 * account of, most often, an empty key field.
 */
export function explainAttempts(attempts: readonly AttemptRecord[]): string {
  if (attempts.length === 0) {
    return 'No providers are configured, so there was nothing to send the request to.'
  }

  const reasons = new Set(attempts.map((attempt) => attempt.reason))

  if (reasons.size === 1) {
    const only = [...reasons][0]
    const names = attempts.map((attempt) => attempt.providerId).join(' and ')

    if (only === 'no_key') {
      return `No API key is set for ${names}. Add your own key in Settings, under Provider keys.`
    }
    if (only === 'cooldown') {
      return `${capitalise(names)} are all cooling down after a rate limit. Try again shortly.`
    }
    if (only === 'unsupported_model') {
      const model = attempts[0]?.detail
      return model == null
        ? `No configured provider serves that model.`
        : `No configured provider serves ${model}.`
    }
    if (only === 'rate_limit') {
      return `${capitalise(names)} rate limited the request. Try again shortly.`
    }
  }

  // Mixed causes: name each one, because the fix differs per provider.
  return `No provider could answer — ${attempts
    .map((attempt) => `${attempt.providerId}: ${phrase(attempt.reason)}`)
    .join('; ')}.`
}

function phrase(reason: AttemptReason): string {
  if (reason === 'no_key') return 'no API key set'
  if (reason === 'cooldown') return 'cooling down after a rate limit'
  if (reason === 'unsupported_model') return 'does not serve that model'
  if (reason === 'rate_limit') return 'rate limited'
  return 'temporarily unavailable'
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Thrown after the client already has bytes, so failover is no longer allowed. */
export class MidStreamError extends Error {
  constructor(
    readonly providerId: string,
    message: string,
  ) {
    super(message)
    this.name = 'MidStreamError'
  }
}
