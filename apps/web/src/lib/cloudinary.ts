import { createHash } from 'node:crypto'
import { z } from 'zod'

const configSchema = z.object({
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
})

export class CloudinaryNotConfigured extends Error {}
export class CloudinaryCredentialError extends Error {}

/** Whose account a picture is being written to. */
export interface CloudinaryCredential {
  readonly cloudName: string
  readonly apiKey: string
  readonly apiSecret: string
}

export function isCloudinaryConfigured(): boolean {
  return configSchema.safeParse(process.env).success
}

/**
 * The operator's own account: the shared test pool, swept hourly. A user who
 * connects their own account writes there instead and keeps the pictures.
 */
export function operatorCloudinary(): CloudinaryCredential | null {
  const parsed = configSchema.safeParse(process.env)
  if (!parsed.success) return null
  return {
    cloudName: parsed.data.CLOUDINARY_CLOUD_NAME,
    apiKey: parsed.data.CLOUDINARY_API_KEY,
    apiSecret: parsed.data.CLOUDINARY_API_SECRET,
  }
}

/**
 * What the user pastes: the three values Cloudinary's dashboard shows together,
 * joined by colons — the same shape Cloudflare's credential already uses, so
 * the account panel needs no second kind of field.
 *
 * The secret may itself contain a colon, so only the first two are split off.
 */
export function parseCloudinaryCredential(raw: string): CloudinaryCredential {
  const parts = raw.trim().split(':')
  const cloudName = parts[0]?.trim() ?? ''
  const apiKey = parts[1]?.trim() ?? ''
  const apiSecret = parts.slice(2).join(':').trim()

  if (cloudName === '' || apiKey === '' || apiSecret === '') {
    throw new CloudinaryCredentialError(
      'Paste it as cloud_name:api_key:api_secret, all three from your Cloudinary dashboard.',
    )
  }
  return { cloudName, apiKey, apiSecret }
}

/**
 * Cloudinary signs uploads with a SHA-1 of the parameters, sorted by name,
 * joined with & and followed by the API secret. file, cloud_name,
 * resource_type and api_key are excluded from the signature.
 * https://cloudinary.com/documentation/authentication_signatures
 */
export function signParams(params: Record<string, string>, secret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return createHash('sha1').update(`${canonical}${secret}`).digest('hex')
}

export interface StoredImage {
  readonly publicId: string
  readonly url: string
  readonly bytes: number
}

export async function uploadImage(
  image: Uint8Array,
  folder: string,
  signal: AbortSignal,
  account: CloudinaryCredential,
): Promise<StoredImage> {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signed = { folder, timestamp }

  const form = new FormData()
  form.append('file', new Blob([image as BlobPart], { type: 'image/png' }), 'image.png')
  form.append('api_key', account.apiKey)
  form.append('folder', folder)
  form.append('timestamp', timestamp)
  form.append('signature', signParams(signed, account.apiSecret))

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${account.cloudName}/image/upload`,
    { method: 'POST', body: form, signal },
  )

  if (!response.ok) {
    throw new Error(`Cloudinary refused the upload (${response.status}).`)
  }

  const body = (await response.json()) as {
    public_id?: string
    secure_url?: string
    bytes?: number
  }
  if (typeof body.public_id !== 'string' || typeof body.secure_url !== 'string') {
    throw new Error('Cloudinary returned an unexpected response.')
  }
  return { publicId: body.public_id, url: body.secure_url, bytes: body.bytes ?? 0 }
}

/** Returns true when the asset is gone, including when it was already absent. */
export async function deleteImage(
  publicId: string,
  account: CloudinaryCredential,
): Promise<boolean> {
  const timestamp = String(Math.floor(Date.now() / 1000))

  const form = new FormData()
  form.append('public_id', publicId)
  form.append('api_key', account.apiKey)
  form.append('timestamp', timestamp)
  form.append('signature', signParams({ public_id: publicId, timestamp }, account.apiSecret))

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${account.cloudName}/image/destroy`,
    { method: 'POST', body: form },
  )
  if (!response.ok) return false

  const body = (await response.json()) as { result?: string }
  return body.result === 'ok' || body.result === 'not found'
}
