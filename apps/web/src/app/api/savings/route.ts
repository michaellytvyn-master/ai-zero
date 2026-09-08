import { type ReferenceModel, referenceModel, savingsFrom } from '@zca/pricing'
import { resolveUser } from '@/lib/request-user'
import { unauthenticatedResponse } from '@/lib/responses'
import { usageTotalsForUser } from '@/lib/savings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  const requested = new URL(request.url).searchParams.get('model')
  let model: ReferenceModel
  try {
    model = referenceModel(requested ?? undefined)
  } catch {
    return Response.json({ error: { type: 'unknown_model' } }, { status: 400 })
  }

  return Response.json(savingsFrom(await usageTotalsForUser(user.id), model), {
    headers: { 'cache-control': 'no-store' },
  })
}
