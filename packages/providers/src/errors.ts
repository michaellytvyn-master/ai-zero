export type ErrorKind = 'rate_limit' | 'transient' | 'auth' | 'fatal'

export class ProviderHttpError extends Error {
  constructor(
    readonly providerId: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderHttpError'
  }
}

export function classifyHttpStatus(status: number): ErrorKind {
  if (status === 429) return 'rate_limit'
  // 402 means the account is out of allowance rather than misconfigured, so
  // cooling the provider down and moving on is right; aborting the chain is not.
  if (status === 402) return 'rate_limit'
  if (status === 401 || status === 403) return 'auth'
  if (status === 408 || status >= 500) return 'transient'
  return 'fatal'
}

export function classifyThrown(e: unknown): ErrorKind {
  if (e instanceof ProviderHttpError) return classifyHttpStatus(e.status)
  // AbortError is our own first-token timeout; a TypeError from fetch is a
  // network failure. Both mean "try the next provider", not "give up".
  if (e instanceof Error && e.name === 'AbortError') return 'transient'
  if (e instanceof TypeError) return 'transient'
  return 'transient'
}

export function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  const date = Date.parse(header)
  if (Number.isNaN(date)) return null
  return Math.max(0, Math.ceil((date - Date.now()) / 1000))
}
