import { classifyThrown } from './errors'
import { openAICompatibleChat } from './openai-compatible'
import type { Provider } from './types'

export const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1'

export function createMistral(baseUrl: string = MISTRAL_BASE_URL): Provider {
  return {
    id: 'mistral',
    label: 'Mistral',
    priority: 10,
    signupUrl: 'https://console.mistral.ai/api-keys',
    baseUrl,
    credentialHint: 'API key',
    keyEnvVar: 'MISTRAL_API_KEY',
    // Commercial ToS allows a "Customer Offering" serving End Users, and forbids
    // buying/selling/transferring keys. The free Experiment tier also requires
    // opting into model training — surfaced on /privacy.
    termsAllowServingEndUsers: true,
    models: [
      { id: 'ministral-3-8b-2512', label: 'Ministral 3 8B', contextWindow: 256000, free: true },
      { id: 'ministral-3-14b-2512', label: 'Ministral 3 14B', contextWindow: 256000, free: true },
    ],
    chat: openAICompatibleChat({ providerId: 'mistral', baseUrl, usesStreamOptions: false }),
    classifyError: classifyThrown,
  }
}

export const mistral = createMistral()
