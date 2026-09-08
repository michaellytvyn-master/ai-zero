import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderHttpError } from './errors'
import { EmptyRecordingError, MAX_AUDIO_BYTES, openAICompatibleTranscribe } from './transcription'

const transcribe = openAICompatibleTranscribe({
  providerId: 'test',
  baseUrl: 'https://api.test.invalid/v1',
})

const signal = () => new AbortController().signal
const audio = (bytes = 1024, type = 'audio/webm;codecs=opus') =>
  new Blob([new Uint8Array(bytes)], { type })

function captureFetch(response: () => Response) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(response())
  })
  return {
    url: () => calls[0]?.url ?? '',
    form: () => calls[0]?.init.body as FormData,
    headers: () => calls[0]?.init.headers as Record<string, string>,
  }
}

const ok = (text: unknown) => new Response(JSON.stringify({ text }), { status: 200 })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the request', () => {
  it('posts multipart to the audio endpoint with the chosen model', async () => {
    const captured = captureFetch(() => ok('hello there'))

    await transcribe(audio(), 'whisper-large-v3-turbo', 'key', signal())

    expect(captured.url()).toBe('https://api.test.invalid/v1/audio/transcriptions')
    expect(captured.form().get('model')).toBe('whisper-large-v3-turbo')
    expect(captured.form().get('response_format')).toBe('json')
    expect(captured.headers().authorization).toBe('Bearer key')
  })

  /** The API picks its decoder from the filename, not from the blob's type. */
  it('names the file after the recording format', async () => {
    const captured = captureFetch(() => ok(''))

    await transcribe(audio(64, 'audio/webm;codecs=opus'), 'm', 'key', signal())
    expect((captured.form().get('file') as File).name).toBe('audio.webm')

    vi.unstubAllGlobals()
    const mp4 = captureFetch(() => ok(''))
    await transcribe(audio(64, 'audio/mp4'), 'm', 'key', signal())
    expect((mp4.form().get('file') as File).name).toBe('audio.mp4')
  })
})

describe('what it refuses to send', () => {
  it('rejects an empty recording without spending a request', async () => {
    const captured = captureFetch(() => ok(''))

    await expect(transcribe(audio(0), 'm', 'key', signal())).rejects.toThrow(EmptyRecordingError)
    expect(captured.url()).toBe('')
  })

  it('rejects a file past the free-tier upload limit', async () => {
    const captured = captureFetch(() => ok(''))

    await expect(transcribe(audio(MAX_AUDIO_BYTES + 1), 'm', 'key', signal())).rejects.toThrow(
      EmptyRecordingError,
    )
    expect(captured.url()).toBe('')
  })
})

describe('the response', () => {
  it('returns the transcript, trimmed', async () => {
    captureFetch(() => ok('  spoken words  '))
    expect(await transcribe(audio(), 'm', 'key', signal())).toBe('spoken words')
  })

  it('returns empty rather than throwing when nothing was recognised', async () => {
    captureFetch(() => ok(undefined))
    expect(await transcribe(audio(), 'm', 'key', signal())).toBe('')
  })

  it('surfaces a rate limit as the same error the chat path uses', async () => {
    captureFetch(() => new Response('slow down', { status: 429, headers: { 'retry-after': '12' } }))

    const failure = await transcribe(audio(), 'm', 'key', signal()).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ProviderHttpError)
    expect((failure as ProviderHttpError).retryAfterSeconds).toBe(12)
  })
})
