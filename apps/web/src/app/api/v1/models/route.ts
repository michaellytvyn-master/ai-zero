import { handleModels } from '@zca/router-core'
import { resolveUser } from '@/lib/request-user'
import { unauthenticatedResponse } from '@/lib/responses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** OpenAI-compatible catalogue, so a client can discover ids at runtime. */
export async function GET(request: Request): Promise<Response> {
  if ((await resolveUser(request)) === null) return unauthenticatedResponse()
  return handleModels()
}
