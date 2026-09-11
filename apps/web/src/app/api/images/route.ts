import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  ImagePromptError,
  MAX_IMAGE_PROMPT,
  generateImage,
} from '@zca/providers'
import { z } from 'zod'
import { runtimeConfig } from '@/config'
import { CloudinaryNotConfigured, uploadImage } from '@/lib/cloudinary'
import { imageDestination } from '@/lib/image-store'
import { contentStoreFor } from '@/lib/content-store'
import { IMAGE_LIFETIME_MS, recordImage } from '@/lib/images'
import { decryptedKeys } from '@/lib/provider-keys'
import { resolveUser } from '@/lib/request-user'
import { demoExhaustedResponse, unauthenticatedResponse } from '@/lib/responses'
import { TRIAL_IMAGES_PER_DAY, claimDemoMessage, claimTrialImage } from '@/lib/usage'
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

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
  }

  // Their own account if they connected one, otherwise the shared test pool.
  const destination = await imageDestination(user.id)
  if (destination === null) {
    return Response.json(
      {
        error: {
          type: 'unconfigured',
          message:
            'Image storage is not set up on this server. Connect your own Cloudinary account in ' +
            'Settings to keep generated pictures in it.',
        },
      },
      { status: 501 },
    )
  }

  // The operator's Cloudinary is a place to try the feature: five pictures a
  // day, each gone after half an hour. The user's own account has no cap.
  if (destination.storage === 'operator') {
    const slot = await claimTrialImage(user.id)
    if (!slot.allowed) {
      return Response.json(
        {
          error: {
            type: 'image_trial_exhausted',
            message:
              `That is all ${TRIAL_IMAGES_PER_DAY} trial pictures for today. Connect your own ` +
              'Cloudinary account in Settings to make as many as you like and keep them.',
          },
        },
        { status: 429 },
      )
    }
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
    // A user's own account gets a plain folder; the shared pool keeps the user
    // id so one person's pictures can be found and swept without the others.
    const folder = destination.storage === 'user' ? 'zero-cost-ai' : `zca/${user.id}`
    const stored = await uploadImage(image.bytes, folder, request.signal, destination.account)

    // Only a picture in the shared pool is recorded here, because only that one
    // has to be found again and deleted. One in the user's own account is
    // theirs, and the operator's database keeps no trace of it.
    const expiresAt =
      destination.storage === 'operator'
        ? (
            await recordImage({
              userId: user.id,
              conversationId: parsed.data.conversationId ?? null,
              publicId: stored.publicId,
              url: stored.url,
              model,
              bytes: stored.bytes,
              storage: 'operator',
            })
          ).expiresAt
        : null

    if (parsed.data.conversationId !== undefined) {
      const store = await contentStoreFor(user.id)
      await store.append(parsed.data.conversationId, {
        role: 'assistant',
        content: `![generated image](${stored.url})`,
        providerId: 'cloudflare',
        model,
      })
    }

    return Response.json({
      url: stored.url,
      model,
      // Null says "this one is yours and is kept", which the caption renders
      // instead of a countdown.
      expiresAt: expiresAt?.toISOString() ?? null,
      lifetimeMinutes: Math.round(IMAGE_LIFETIME_MS / 60_000),
      storage: destination.storage,
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
