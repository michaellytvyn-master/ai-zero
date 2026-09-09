import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  ImagePromptError,
  MAX_IMAGE_PROMPT,
  generateImage,
} from '@zca/providers'
import { z } from 'zod'
import { runtimeConfig } from '@/config'
import { CloudinaryNotConfigured, isCloudinaryConfigured, uploadImage } from '@/lib/cloudinary'
import { appendMessage } from '@/lib/conversations'
import { IMAGE_LIFETIME_MS, recordImage } from '@/lib/images'
import { decryptedKeys } from '@/lib/provider-keys'
import { resolveUser } from '@/lib/request-user'
import { demoExhaustedResponse, unauthenticatedResponse } from '@/lib/responses'
import { claimDemoMessage } from '@/lib/usage'
import { claimRequestSlot, tooManyRequests } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  prompt: z.string().min(1).max(MAX_IMAGE_PROMPT),
  conversationId: z.string().uuid().optional(),
  model: z.string().optional(),
})

const CLOUDFLARE_API_ROOT = 'https://api.cloudflare.com/client/v4'

export async function POST(request: Request): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  // Applies whoever the keys belong to. Provider quotas are per organisation,
  // so many users cost nothing — but one runaway client would make this
  // server's egress look abusive to everyone sharing it.
  const slot = await claimRequestSlot(user.id)
  if (!slot.allowed) return tooManyRequests(slot)

  if (!isCloudinaryConfigured()) {
    return Response.json(
      { error: { type: 'unconfigured', message: 'Image storage is not set up on this server.' } },
      { status: 501 },
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
  }

  const own = (await decryptedKeys(user.id)).get('cloudflare')
  const credential =
    own ??
    (process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN
      ? `${process.env.CF_ACCOUNT_ID}:${process.env.CF_API_TOKEN}`
      : undefined)

  if (credential === undefined) {
    return Response.json(
      { error: { type: 'no_provider_available', message: 'No Cloudflare credentials.' } },
      { status: 503 },
    )
  }

  const separator = credential.indexOf(':')
  const accountId = credential.slice(0, separator)
  const token = credential.slice(separator + 1)

  // A picture costs the operator far more than a sentence does, so on the
  // shared pool it spends from the same daily allowance.
  if (own === undefined) {
    const allowance = await claimDemoMessage(user.id)
    if (!allowance.allowed) {
      return demoExhaustedResponse(runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY)
    }
  }

  const model = IMAGE_MODELS.some((entry) => entry.id === parsed.data.model)
    ? (parsed.data.model as string)
    : DEFAULT_IMAGE_MODEL

  try {
    const image = await generateImage(
      { prompt: parsed.data.prompt, model, accountId, token, apiRoot: CLOUDFLARE_API_ROOT },
      request.signal,
    )
    const stored = await uploadImage(image.bytes, `zca/${user.id}`, request.signal)
    const row = await recordImage({
      userId: user.id,
      conversationId: parsed.data.conversationId ?? null,
      publicId: stored.publicId,
      url: stored.url,
      model,
      bytes: stored.bytes,
    })

    if (parsed.data.conversationId !== undefined) {
      await appendMessage(parsed.data.conversationId, {
        role: 'assistant',
        content: `![generated image](${row.url})`,
        providerId: 'cloudflare',
        model,
      })
    }

    return Response.json({
      id: row.id,
      url: row.url,
      model,
      expiresAt: row.expiresAt.toISOString(),
      lifetimeMinutes: Math.round(IMAGE_LIFETIME_MS / 60_000),
    })
  } catch (error) {
    if (error instanceof ImagePromptError) {
      return Response.json(
        { error: { type: 'invalid_request', message: error.message } },
        { status: 400 },
      )
    }
    if (error instanceof CloudinaryNotConfigured) {
      return Response.json(
        { error: { type: 'unconfigured', message: error.message } },
        { status: 501 },
      )
    }
    return Response.json(
      { error: { type: 'generation_failed', message: 'Could not generate that image.' } },
      { status: 502 },
    )
  }
}
