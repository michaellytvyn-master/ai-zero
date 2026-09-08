import { createGroqTranscriber } from '@zca/providers'
import { SITE_URL } from './config'
import type { Session } from './session'

/**
 * Same split as chat: with the user's own key the audio goes straight to the
 * provider and never touches our server; without one it goes through the site
 * and spends the shared daily allowance.
 */
export async function transcribe(
  session: Session,
  audio: Blob,
  signal: AbortSignal,
): Promise<string> {
  const groq = session.providers.find((provider) => provider.id === 'groq')

  if (groq?.key != null) {
    const transcriber = createGroqTranscriber(groq.baseUrl)
    const model = transcriber.models[0]?.id
    if (model === undefined) throw new Error('No transcription model is available.')
    return transcriber.transcribe(audio, model, groq.key, signal)
  }

  const form = new FormData()
  form.append('file', audio, 'audio.webm')

  const response = await fetch(`${SITE_URL}/api/transcribe`, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${session.token}` },
    body: form,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { type?: string } } | null
    throw new Error(
      body?.error?.type === 'demo_exhausted'
        ? "Today's free messages are used up, and voice input spends them too."
        : 'Could not transcribe that recording.',
    )
  }

  return ((await response.json()) as { text: string }).text
}
