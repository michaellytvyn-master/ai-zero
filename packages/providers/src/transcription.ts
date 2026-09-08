import { ProviderHttpError, parseRetryAfter } from './errors'
import type { ModelSpec } from './types'

/** Free tier caps the upload at 25 MB; this stays under it with room to spare. */
export const MAX_AUDIO_BYTES = 24 * 1024 * 1024

/** Long recordings burn the daily audio-seconds allowance fast. */
export const MAX_RECORDING_SECONDS = 120

export interface Transcriber {
  readonly providerId: string
  readonly label: string
  readonly models: readonly ModelSpec[]
  readonly keyEnvVar: string
  readonly signupUrl: string
  transcribe(audio: Blob, model: string, key: string, signal: AbortSignal): Promise<string>
}

export interface TranscribeConfig {
  readonly providerId: string
  /** Without a trailing slash, e.g. https://api.groq.com/openai/v1 */
  readonly baseUrl: string
}

/**
 * Whisper over the OpenAI audio API: multipart, one file, plain JSON back.
 * Separate from the chat helper because nothing about it streams.
 */
export function openAICompatibleTranscribe(config: TranscribeConfig): Transcriber['transcribe'] {
  return async (audio, model, key, signal) => {
    if (audio.size === 0) throw new EmptyRecordingError('Nothing was recorded.')
    if (audio.size > MAX_AUDIO_BYTES) {
      throw new EmptyRecordingError('That recording is too long to send.')
    }

    const form = new FormData()
    form.append('file', audio, fileNameFor(audio.type))
    form.append('model', model)
    form.append('response_format', 'json')

    const response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      signal,
      headers: { authorization: `Bearer ${key}` },
      body: form,
    })

    if (!response.ok) {
      throw new ProviderHttpError(
        config.providerId,
        response.status,
        parseRetryAfter(response.headers.get('retry-after')),
        `${config.providerId} returned ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`,
      )
    }

    const body = (await response.json()) as { text?: unknown }
    return typeof body.text === 'string' ? body.text.trim() : ''
  }
}

export class EmptyRecordingError extends Error {}

/**
 * The API picks its decoder from the extension, so a name is required even
 * though the bytes carry the type. MediaRecorder in Chrome produces WebM.
 */
function fileNameFor(mimeType: string): string {
  const known: Record<string, string> = {
    'audio/webm': 'audio.webm',
    'audio/ogg': 'audio.ogg',
    'audio/mp4': 'audio.mp4',
    'audio/mpeg': 'audio.mp3',
    'audio/wav': 'audio.wav',
  }
  const base = mimeType.split(';')[0] ?? ''
  return known[base] ?? 'audio.webm'
}
