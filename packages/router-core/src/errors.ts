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
    super('every provider was skipped or failed')
    this.name = 'AllProvidersFailedError'
  }
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
