import { z } from 'zod'
import { ProviderHttpError, parseRetryAfter } from './errors'

/**
 * Cloudflare's text-to-image models. flux-1-schnell costs 4.8 neurons per
 * 512x512 tile against a 10 000/day free allowance — roughly two thousand
 * images a day — which is why it is the default. The Leonardo models cost over
 * a hundred times more per tile and would exhaust the day in a dozen pictures.
 * Verified 2026-09-09 against the Workers AI pricing table.
 */
export interface ImageModelSpec {
  readonly id: string
  readonly label: string
  readonly neuronsPerTile: number
}

export const IMAGE_MODELS: readonly ImageModelSpec[] = [
  { id: '@cf/black-forest-labs/flux-1-schnell', label: 'FLUX.1 schnell', neuronsPerTile: 4.8 },
  { id: '@cf/black-forest-labs/flux-2-klein-4b', label: 'FLUX.2 Klein 4B', neuronsPerTile: 5.37 },
]

export const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[0]?.id ?? ''

export const MAX_IMAGE_PROMPT = 2048

/** flux-1-schnell caps steps at 8; more is rejected rather than slower. */
const MAX_STEPS = 8

const responseSchema = z.object({
  result: z
    .object({
      image: z.string().optional(),
      images: z.array(z.string()).optional(),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

export class ImagePromptError extends Error {}

export interface GeneratedImage {
  /** Raw PNG bytes, decoded from the base64 the API returns. */
  readonly bytes: Uint8Array
  readonly model: string
}

export function cloudflareImageUrl(accountId: string, model: string, apiRoot: string): string {
  return `${apiRoot}/accounts/${accountId}/ai/run/${model}`
}

export async function generateImage(
  options: {
    readonly prompt: string
    readonly model: string
    readonly accountId: string
    readonly token: string
    readonly apiRoot: string
    readonly steps?: number
  },
  signal: AbortSignal,
): Promise<GeneratedImage> {
  const prompt = options.prompt.trim()
  if (prompt.length === 0) throw new ImagePromptError('Describe the image you want.')
  if (prompt.length > MAX_IMAGE_PROMPT) {
    throw new ImagePromptError(`Keep the description under ${MAX_IMAGE_PROMPT} characters.`)
  }

  const response = await fetch(
    cloudflareImageUrl(options.accountId, options.model, options.apiRoot),
    {
      method: 'POST',
      signal,
      headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        steps: Math.min(MAX_STEPS, Math.max(1, options.steps ?? 4)),
      }),
    },
  )

  if (!response.ok) {
    throw new ProviderHttpError(
      'cloudflare',
      response.status,
      parseRetryAfter(response.headers.get('retry-after')),
      `cloudflare returned ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`,
    )
  }

  const parsed = responseSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error('The image service returned something unreadable.')

  const base64 = parsed.data.result?.image ?? parsed.data.result?.images?.[0]
  if (base64 === undefined || base64.length === 0) {
    throw new Error(parsed.data.errors?.[0]?.message ?? 'No image came back.')
  }

  return { bytes: decodeBase64(base64), model: options.model }
}

function decodeBase64(value: string): Uint8Array {
  // Strips a data: prefix if one is ever added, so the decoder does not choke.
  const payload = value.includes(',') ? (value.split(',')[1] ?? '') : value
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
