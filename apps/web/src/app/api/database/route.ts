import { z } from 'zod'
import { UnauthenticatedError, requireUser } from '@/auth'
import {
  connectUserDatabase,
  connectedDatabase,
  disconnectUserDatabase,
} from '@/lib/connect-database'
import { claimRequestSlot, tooManyRequests } from '@/lib/rate-limit'
import { unauthenticatedResponse } from '@/lib/responses'
import { UserDatabaseError } from '@/lib/user-database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ url: z.string().min(12).max(2_000) })

/**
 * The user's own database. Signed-in sessions only — not an API key, not the
 * extension: pointing the server at a database is an account setting, made by
 * the person, on the site.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await requireUser()
    return Response.json({ where: await connectedDatabase(user.id) })
  } catch (error) {
    return rethrowUnlessAuth(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser()
    // Each attempt opens a connection to an address the user typed. Rate
    // limited like any provider call, so the server cannot be made to knock on
    // doors in bulk.
    const slot = await claimRequestSlot(user.id)
    if (!slot.allowed) return tooManyRequests(slot)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return badRequest('Paste the whole connection address.')

    try {
      const result = await connectUserDatabase(user.id, parsed.data.url)
      return Response.json(result)
    } catch (error) {
      if (error instanceof UserDatabaseError) return badRequest(error.userMessage)
      throw error
    }
  } catch (error) {
    return rethrowUnlessAuth(error)
  }
}

export async function DELETE(): Promise<Response> {
  try {
    const user = await requireUser()
    await disconnectUserDatabase(user.id)
    return Response.json({ where: null })
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
