import { z } from 'zod'
import { resolveUser } from '@/lib/request-user'
import { unauthenticatedResponse } from '@/lib/responses'
import { recordUsage } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Metadata the extension reports after calling a provider directly. The schema
 * is strict, so a client cannot smuggle prompt text into the usage table by
 * adding a field.
 */
const schema = z
  .object({
    providerId: z.string().min(1).max(64),
    model: z.string().min(1).max(128),
    inputTokens: z.number().int().nonnegative().max(10_000_000),
    outputTokens: z.number().int().nonnegative().max(10_000_000),
    latencyMs: z.number().int().nonnegative().max(600_000),
    status: z.number().int().min(100).max(599),
  })
  .strict()

export async function POST(request: Request): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
  }

  await recordUsage(user.id, {
    ...parsed.data,
    at: new Date().toISOString(),
    source: 'direct',
    keyOwner: 'user',
  })

  return new Response(null, { status: 204 })
}
