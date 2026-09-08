import { z } from 'zod'
import { appendMessage, loadConversation } from '@/lib/conversations'
import { resolveUser } from '@/lib/request-user'
import { unauthenticatedResponse } from '@/lib/responses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(200_000),
    providerId: z.string().max(64).nullish(),
    model: z.string().max(128).nullish(),
  })
  .strict()

/**
 * Used by the extension, which calls providers directly and therefore holds the
 * only copy of the exchange. Ownership is checked by loading the conversation
 * as this user first, so one account cannot append to another's history.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
  }

  const { id } = await params
  if ((await loadConversation(user.id, id)) === null) {
    return Response.json({ error: { type: 'not_found' } }, { status: 404 })
  }

  await appendMessage(id, {
    role: parsed.data.role,
    content: parsed.data.content,
    providerId: parsed.data.providerId ?? null,
    model: parsed.data.model ?? null,
  })
  return new Response(null, { status: 204 })
}
