export interface ImageResult {
  readonly url: string
  /** Null when the picture went to the user's own account and is kept. */
  readonly expiresAt: string | null
  readonly model: string
  readonly lifetimeMinutes: number
}

export type ImageOutcome =
  | { readonly ok: true; readonly image: ImageResult }
  | { readonly ok: false; readonly message: string; readonly exhausted: boolean }

export async function generateImage(
  prompt: string,
  conversationId: string | null,
): Promise<ImageOutcome> {
  const response = await fetch('/api/images', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      ...(conversationId !== null && { conversationId }),
    }),
  })

  const body = (await response.json().catch(() => null)) as
    | (ImageResult & { error?: { type?: string; message?: string } })
    | null

  if (!response.ok || body === null) {
    return {
      ok: false,
      exhausted: body?.error?.type === 'demo_exhausted',
      message: body?.error?.message ?? 'Could not generate that image.',
    }
  }
  return { ok: true, image: body }
}
