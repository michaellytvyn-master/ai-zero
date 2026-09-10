import type { ChatMessage, ChatRequest } from './chat'

export type ResponseMode = 'eco' | 'thinking' | 'max'

export interface ResponseModeSpec {
  readonly id: ResponseMode
  readonly label: string
  /** One line, shown next to the control. */
  readonly hint: string
  /**
   * Hard ceiling on the reply. Free tiers are metered in tokens, so this is the
   * part that actually protects the daily allowance; the prompt alone is a
   * request, not a limit.
   */
  readonly maxTokens: number
  /**
   * Extra ceiling for a reasoning model's thinking, granted on top of
   * maxTokens. Without it the whole allowance goes on the thought and the
   * answer is cut off before it starts; it is not spent by ordinary models.
   */
  readonly reasoningTokens: number
  /** Passed to providers with a native effort dial, so the two agree. */
  readonly reasoningEffort: 'low' | 'medium' | 'high'
  readonly systemPrompt: string
}

/** Cheapest by default: free tiers are metered, and most questions are short. */
export const DEFAULT_RESPONSE_MODE: ResponseMode = 'eco'

export const responseModes: readonly ResponseModeSpec[] = [
  {
    id: 'eco',
    label: 'Eco',
    hint: 'short answers, least tokens',
    maxTokens: 400,
    reasoningTokens: 1500,
    reasoningEffort: 'low',
    systemPrompt:
      'Answer in as few words as the question honestly needs. No preamble, no restating the ' +
      'question, no closing summary. If one sentence or a short list is the whole answer, stop ' +
      'there. Only write at length if a short answer would be wrong or misleading.',
  },
  {
    id: 'thinking',
    label: 'Thinking',
    hint: 'reasons first, then answers',
    maxTokens: 1500,
    reasoningTokens: 3000,
    reasoningEffort: 'medium',
    systemPrompt:
      'Work the problem through before answering. Show the reasoning that actually bears on the ' +
      'result, skip the rest, then state the conclusion plainly. Do not pad, and do not repeat ' +
      'the reasoning in a summary.',
  },
  {
    id: 'max',
    label: 'Max',
    hint: 'thorough, costs the most',
    maxTokens: 4000,
    reasoningTokens: 8000,
    reasoningEffort: 'high',
    systemPrompt:
      'Give a complete answer. Cover the edge cases and caveats that matter, include an example ' +
      'where one clarifies, and explain why, not just what. Use headings or lists when the answer ' +
      'is long enough to need them. Length is allowed, filler is not.',
  },
]

export function responseMode(id: string | null | undefined): ResponseModeSpec {
  const found = responseModes.find((mode) => mode.id === id)
  return found ?? responseMode(DEFAULT_RESPONSE_MODE)
}

export function isResponseMode(value: unknown): value is ResponseMode {
  return responseModes.some((mode) => mode.id === value)
}

/**
 * Puts the mode's instruction ahead of everything else and caps the reply.
 * Any system message the caller already added — page context, say — is kept and
 * follows it, because that is material to read rather than an instruction.
 */
export function applyResponseMode(request: ChatRequest, mode: ResponseMode): ChatRequest {
  const spec = responseMode(mode)
  const instruction: ChatMessage = { role: 'system', content: spec.systemPrompt }

  return {
    ...request,
    messages: [instruction, ...request.messages],
    maxTokens: request.maxTokens ?? spec.maxTokens,
    // Adapters apply this only to models that actually reason, so the ceiling
    // an ordinary model sees is unchanged.
    reasoning: request.reasoning ?? {
      extraTokens: spec.reasoningTokens,
      effort: spec.reasoningEffort,
    },
  }
}
