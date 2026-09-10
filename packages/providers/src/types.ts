import type { ChatChunk, ChatRequest } from '@zca/shared'
import type { ErrorKind } from './errors'

export interface ModelSpec {
  /** The exact string sent as `model` on the wire. */
  readonly id: string
  readonly label: string
  readonly contextWindow: number
  /** True only if reachable on the provider's no-card free tier. */
  readonly free: boolean
  /**
   * How this model surfaces its reasoning, when it reasons at all.
   *  'parsed'  — ask for `reasoning_format: "parsed"`; it arrives in its own field
   *  'include' — ask for `include_reasoning: true` (GPT-OSS; mutually exclusive
   *              with reasoning_format, per Groq's docs)
   *  'effort'  — the provider keeps its thinking to itself; we only grant the
   *              token headroom and pass the effort dial (Gemini)
   *  'tags'    — nothing to ask for; it comes back wrapped in <think> tags
   * Absent means the model does not think out loud.
   */
  readonly reasoning?: 'parsed' | 'include' | 'effort' | 'tags'
  /** Whether the provider accepts `reasoning_effort` of low | medium | high. */
  readonly reasoningEffort?: boolean
}

export interface Provider {
  readonly id: string
  readonly label: string
  /** Lower runs first. */
  readonly priority: number
  readonly models: readonly ModelSpec[]
  readonly signupUrl: string
  readonly keyEnvVar: string
  /** Where requests actually go; the extension calls this directly in BYOK mode. */
  readonly baseUrl: string
  /** What the user pastes. Most providers take one opaque key; Cloudflare does not. */
  readonly credentialHint: string
  /** Checked against the provider's terms; see docs/providers.md. */
  readonly termsAllowServingEndUsers: boolean
  /**
   * Shown wherever the user is about to hand this provider their data. Set only
   * when the free tier treats conversations differently from the others — as
   * Google's does, by training on them and letting reviewers read them.
   */
  readonly privacyWarning?: string

  chat(req: ChatRequest, key: string, signal: AbortSignal): AsyncIterable<ChatChunk>

  classifyError(e: unknown): ErrorKind
}
