import type { ChatChunk, ChatRequest } from '@zca/shared'
import type { ErrorKind } from './errors'

export interface ModelSpec {
  /** The exact string sent as `model` on the wire. */
  readonly id: string
  readonly label: string
  readonly contextWindow: number
  /** True only if reachable on the provider's no-card free tier. */
  readonly free: boolean
}

export interface Provider {
  readonly id: string
  readonly label: string
  /** Lower runs first. */
  readonly priority: number
  readonly models: readonly ModelSpec[]
  readonly signupUrl: string
  readonly keyEnvVar: string
  /** Checked against the provider's terms; see docs/providers.md. */
  readonly termsAllowServingEndUsers: boolean

  chat(req: ChatRequest, key: string, signal: AbortSignal): AsyncIterable<ChatChunk>

  classifyError(e: unknown): ErrorKind
}
