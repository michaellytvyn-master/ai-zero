import { z } from 'zod'
import { providerById } from '@zca/providers'
import { UnauthenticatedError, requireUser } from '@/auth'
import { deleteProviderKey, listProviderKeys, saveProviderKey } from '@/lib/provider-keys'
import { unauthenticatedResponse } from '@/lib/responses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const saveSchema = z.object({
  providerId: z.string().min(1),
  key: z.string().min(8, 'that key looks too short'),
})

const deleteSchema = z.object({ providerId: z.string().min(1) })

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser()
    return Response.json({ keys: await listProviderKeys(user.id) })
  } catch (error) {
    return rethrowUnlessAuth(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser()
    const parsed = saveSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'invalid body')
    if (providerById(parsed.data.providerId) === undefined) return badRequest('unknown provider')

    await saveProviderKey(user.id, parsed.data.providerId, parsed.data.key)
    return Response.json({ keys: await listProviderKeys(user.id) })
  } catch (error) {
    return rethrowUnlessAuth(error)
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await requireUser()
    const parsed = deleteSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return badRequest('invalid body')

    await deleteProviderKey(user.id, parsed.data.providerId)
    return Response.json({ keys: await listProviderKeys(user.id) })
  } catch (error) {
    return rethrowUnlessAuth(error)
  }
}

function badRequest(message: string): Response {
  return Response.json({ error: { type: 'invalid_request', message } }, { status: 400 })
}

function rethrowUnlessAuth(error: unknown): Response {
  if (error instanceof UnauthenticatedError) return unauthenticatedResponse()
  throw error
}
