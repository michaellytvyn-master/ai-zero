import { resolveUser } from '@/lib/request-user'
import { modelCatalogue } from '@/lib/model-catalogue'
import { unauthenticatedResponse } from '@/lib/responses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * OpenAI-compatible catalogue, so a client can discover ids at runtime. Context
 * windows come from each provider's own catalogue where it publishes one, so
 * they do not go stale between releases.
 */
export async function GET(request: Request): Promise<Response> {
  if ((await resolveUser(request)) === null) return unauthenticatedResponse()

  const models = await modelCatalogue(request.signal)
  return Response.json({
    object: 'list',
    data: models.map((model) => ({
      id: model.id,
      object: 'model',
      owned_by: model.providerId,
      context_window: model.contextWindow,
    })),
  })
}
