import { deleteConversation, loadConversation } from '@/lib/conversations'
import { resolveUser } from '@/lib/request-user'
import { unauthenticatedResponse } from '@/lib/responses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  const { id } = await params
  const loaded = await loadConversation(user.id, id)
  // Somebody else's conversation is indistinguishable from one that does not
  // exist, so ids cannot be probed.
  if (loaded === null) return Response.json({ error: { type: 'not_found' } }, { status: 404 })

  return Response.json(
    {
      id: loaded.summary.id,
      title: loaded.summary.title,
      messages: loaded.messages.map((message) => ({
        role: message.role,
        content: message.content,
        providerId: message.providerId,
        model: message.model,
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  const { id } = await params
  await deleteConversation(user.id, id)
  return new Response(null, { status: 204 })
}
