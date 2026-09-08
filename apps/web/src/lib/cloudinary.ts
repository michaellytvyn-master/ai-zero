import { createHash } from 'node:crypto'
import { z } from 'zod'

const configSchema = z.object({
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
})

export class CloudinaryNotConfigured extends Error {}

export function isCloudinaryConfigured(): boolean {
  return configSchema.safeParse(process.env).success
}

function config() {
  const parsed = configSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new CloudinaryNotConfigured(
      'Image generation needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
    )
  }
  return parsed.data
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
): Promise<StoredImage> {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = config()
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signed = { folder, timestamp }

  const form = new FormData()
  form.append('file', new Blob([image as BlobPart], { type: 'image/png' }), 'image.png')
  form.append('api_key', CLOUDINARY_API_KEY)
  form.append('folder', folder)
  form.append('timestamp', timestamp)
  form.append('signature', signParams(signed, CLOUDINARY_API_SECRET))

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
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
export async function deleteImage(publicId: string): Promise<boolean> {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = config()
  const timestamp = String(Math.floor(Date.now() / 1000))

  const form = new FormData()
  form.append('public_id', publicId)
  form.append('api_key', CLOUDINARY_API_KEY)
  form.append('timestamp', timestamp)
  form.append('signature', signParams({ public_id: publicId, timestamp }, CLOUDINARY_API_SECRET))

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
    { method: 'POST', body: form },
  )
  if (!response.ok) return false

  const body = (await response.json()) as { result?: string }
  return body.result === 'ok' || body.result === 'not found'
}
