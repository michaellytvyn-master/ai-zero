import { classifyThrown } from './errors'
import { openAICompatibleChat } from './openai-compatible'
import type { Provider } from './types'

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'

export function createGroq(baseUrl: string = GROQ_BASE_URL): Provider {
  return {
    id: 'groq',
    label: 'Groq',
    priority: 20,
    signupUrl: 'https://console.groq.com/keys',
    keyEnvVar: 'GROQ_API_KEY',
    // Services Agreement 3.1 permits serving End Users through your own
    // application; 3.2 and 6.3(c) forbid reselling or transferring the key.
    termsAllowServingEndUsers: true,
    models: [
      { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', contextWindow: 131072, free: true },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', contextWindow: 131072, free: true },
    ],
    chat: openAICompatibleChat({ providerId: 'groq', baseUrl, usesStreamOptions: true }),
    classifyError: classifyThrown,
  }
}

export const groq = createGroq()
