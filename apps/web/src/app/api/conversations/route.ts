import { z } from 'zod'
import { createConversation, listConversations } from '@/lib/conversations'
import { resolveUser } from '@/lib/request-user'
import { unauthenticatedResponse } from '@/lib/responses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({ firstMessage: z.string().min(1).max(32_000) })

export async function GET(request: Request): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  const conversations = await listConversations(user.id)
  return Response.json(
    {
      conversations: conversations.map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}

export async function POST(request: Request): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
  }

  return Response.json({ id: await createConversation(user.id, parsed.data.firstMessage) })
}
