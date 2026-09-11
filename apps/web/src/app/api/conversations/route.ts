import { z } from 'zod'
import { withContentStore } from '@/lib/content-store'
import { resolveUser } from '@/lib/request-user'
import { unauthenticatedResponse } from '@/lib/responses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({ firstMessage: z.string().min(1).max(32_000) })

export async function GET(request: Request): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  const raw = new URL(request.url).searchParams.get('before')
  const before = raw === null ? undefined : new Date(raw)
  if (before !== undefined && Number.isNaN(before.getTime())) {
    return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
  }

  return withContentStore(user.id, async (store) => {
    const page = await store.list(before)
    return Response.json(
      {
        conversations: page.items.map((item) => ({
          ...item,
          updatedAt: item.updatedAt.toISOString(),
        })),
        nextCursor: page.nextCursor,
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  })
}

export async function POST(request: Request): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
  }

  return withContentStore(user.id, async (store) =>
    Response.json({ id: await store.create(parsed.data.firstMessage) }),
  )
}
