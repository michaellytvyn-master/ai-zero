import { z } from 'zod'
import { resolveUser } from '@/lib/request-user'
import { unauthenticatedResponse } from '@/lib/responses'
import { readLinkedPages } from '@/lib/web-context'
import { claimRequestSlot, tooManyRequests } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ content: z.string().min(1).max(32_000) })

/**
 * Reads whatever the caller linked to and returns it as one block of context.
 * The extension uses this rather than fetching pages itself: the checks against
 * private addresses live here, in one place, for every surface.
 */
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

  const web = await readLinkedPages(parsed.data.content)
  return Response.json(web, { headers: { 'cache-control': 'no-store' } })
}
