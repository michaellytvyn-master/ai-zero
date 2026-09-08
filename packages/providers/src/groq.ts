import { classifyThrown } from './errors'
import { openAICompatibleChat } from './openai-compatible'
import { type Transcriber, openAICompatibleTranscribe } from './transcription'
import type { Provider } from './types'

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'

export function createGroq(baseUrl: string = GROQ_BASE_URL): Provider {
  return {
    id: 'groq',
    label: 'Groq',
    priority: 10,
    signupUrl: 'https://console.groq.com/keys',
    baseUrl,
    credentialHint: 'API key',
    keyEnvVar: 'GROQ_API_KEY',
    // Services Agreement 3.1 permits serving End Users through your own
    // application; 3.2 and 6.3(c) forbid reselling or transferring the key.
    termsAllowServingEndUsers: true,
    // Every model Groq lists under its free-plan rate limits. Anything absent
    // from that table is absent here, however good it looks in the catalogue.
    models: [
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', contextWindow: 131072, free: true },
      { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', contextWindow: 131072, free: true },
      { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B', contextWindow: 131042, free: true },
      { id: 'qwen/qwen3.6-27b', label: 'Qwen 3.6 27B', contextWindow: 131072, free: true },
      {
        id: 'groq/compound',
        label: 'Compound (web search built in)',
        contextWindow: 131072,
        free: true,
      },
      { id: 'groq/compound-mini', label: 'Compound Mini', contextWindow: 131072, free: true },
    ],
    chat: openAICompatibleChat({ providerId: 'groq', baseUrl, usesStreamOptions: true }),
    classifyError: classifyThrown,
  }
}

export const groq = createGroq()

/**
 * Whisper on the same free tier as the chat models: 20 requests/minute,
 * 2 000/day, 28 800 audio-seconds/day, 25 MB per file. Verified 2026-09-09.
 * https://console.groq.com/docs/speech-to-text
 */
export function createGroqTranscriber(baseUrl: string = GROQ_BASE_URL): Transcriber {
  return {
    providerId: 'groq',
    label: 'Groq Whisper',
    keyEnvVar: 'GROQ_API_KEY',
    signupUrl: 'https://console.groq.com/keys',
    models: [
      {
        id: 'whisper-large-v3-turbo',
        label: 'Whisper large v3 turbo',
        contextWindow: 0,
        free: true,
      },
      { id: 'whisper-large-v3', label: 'Whisper large v3', contextWindow: 0, free: true },
    ],
    transcribe: openAICompatibleTranscribe({ providerId: 'groq', baseUrl }),
  }
}

export const groqTranscriber = createGroqTranscriber()
