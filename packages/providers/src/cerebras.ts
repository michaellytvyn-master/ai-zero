import { classifyThrown } from './errors'
import { openAICompatibleChat } from './openai-compatible'
import type { Provider } from './types'

export const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1'

/**
 * Demoted below Groq, and every model marked `free: false`, because Cerebras
 * retired its no-card free tier in August 2026. What remains is $5 of trial
 * credit that needs a verified payment method and expires after 30 days, so
 * this provider cannot carry the project's zero-cost promise.
 * Context windows are the reduced free-trial figures, not the paid ones.
 */
export function createCerebras(baseUrl: string = CEREBRAS_BASE_URL): Provider {
  return {
    id: 'cerebras',
    label: 'Cerebras',
    priority: 30,
    signupUrl: 'https://cloud.cerebras.ai/',
    keyEnvVar: 'CEREBRAS_API_KEY',
    termsAllowServingEndUsers: true,
    models: [
      { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', contextWindow: 65536, free: false },
      { id: 'qwen-3.8-27b', label: 'Qwen 3.8 27B', contextWindow: 65536, free: false },
    ],
    chat: openAICompatibleChat({ providerId: 'cerebras', baseUrl, usesStreamOptions: true }),
    classifyError: classifyThrown,
  }
}

export const cerebras = createCerebras()
