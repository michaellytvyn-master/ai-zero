import { z } from 'zod'
import { requireUser } from '@/auth'
import { issueApiKey, listApiKeys, revokeApiKey } from '@/lib/api-keys'
import { unauthenticatedResponse } from '@/lib/responses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({ name: z.string().max(60).optional() })
const revokeSchema = z.object({ id: z.string().uuid() })

/**
 * Session-only on purpose: an API key must not be able to mint more API keys,
 * or a leaked one becomes permanent.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await requireUser()
    return Response.json({ keys: await listApiKeys(user.id) })
  } catch {
    return unauthenticatedResponse()
  }
}

export async function POST(request: Request): Promise<Response> {
  let user: { id: string }
  try {
    user = await requireUser()
  } catch {
    return unauthenticatedResponse()
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
  }

  const issued = await issueApiKey(user.id, parsed.data.name ?? 'Untitled key')
  return Response.json({ key: issued, keys: await listApiKeys(user.id) })
}

export async function DELETE(request: Request): Promise<Response> {
  let user: { id: string }
  try {
    user = await requireUser()
  } catch {
    return unauthenticatedResponse()
  }

  const parsed = revokeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: { type: 'invalid_request' } }, { status: 400 })
  }

  await revokeApiKey(user.id, parsed.data.id)
  return Response.json({ keys: await listApiKeys(user.id) })
}
