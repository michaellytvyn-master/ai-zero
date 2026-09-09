import { EmptyRecordingError, MAX_AUDIO_BYTES } from '@zca/providers'
import { runtimeConfig } from '@/config'
import { decryptedKeys, markKeyUsed } from '@/lib/provider-keys'
import { transcriber } from '@/lib/router-deps'
import { resolveUser } from '@/lib/request-user'
import { demoExhaustedResponse, unauthenticatedResponse } from '@/lib/responses'
import { claimDemoMessage } from '@/lib/usage'
import { claimRequestSlot, tooManyRequests } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Speech to text. The audio is forwarded to the provider and never written to
 * disk or to the database — only the text comes back, and the caller decides
 * whether to send it anywhere.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  // Applies whoever the keys belong to. Provider quotas are per organisation,
  // so many users cost nothing — but one runaway client would make this
  // server's egress look abusive to everyone sharing it.
  const slot = await claimRequestSlot(user.id)
  if (!slot.allowed) return tooManyRequests(slot)

  const speech = transcriber()

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: { type: 'too_large' } }, { status: 413 })
  }

  const own = (await decryptedKeys(user.id)).get(speech.providerId)
  const key = own ?? process.env[speech.keyEnvVar]?.trim()
  if (key === undefined || key.length === 0) {
    return Response.json({ error: { type: 'no_provider_available' } }, { status: 503 })
  }

  // Transcription on the shared pool spends the operator's audio allowance, so
  // it is capped the same way messages are.
  if (own === undefined) {
    const allowance = await claimDemoMessage(user.id)
    if (!allowance.allowed) {
      return demoExhaustedResponse(runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY)
    }
  }

  const model = speech.models[0]?.id
  if (model === undefined) {
    return Response.json({ error: { type: 'unsupported' } }, { status: 501 })
  }

  try {
    const text = await speech.transcribe(file, model, key, request.signal)
    if (own !== undefined) await markKeyUsed(user.id, speech.providerId, 200)
    return Response.json({ text }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    if (error instanceof EmptyRecordingError) {
      return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
    }
    return Response.json(
      { error: { type: 'transcription_failed', message: 'Could not transcribe that recording.' } },
      { status: 502 },
    )
  }
}
