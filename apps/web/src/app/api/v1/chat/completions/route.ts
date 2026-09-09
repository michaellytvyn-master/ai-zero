import { handleChatCompletions } from '@zca/router-core'
import { runtimeConfig } from '@/config'
import { buildRouterContext } from '@/lib/router-deps'
import { demoExhaustedResponse, unauthenticatedResponse } from '@/lib/responses'
import { resolveUser } from '@/lib/request-user'
import { claimDemoMessage } from '@/lib/usage'
import { claimRequestSlot, tooManyRequests } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * OpenAI-compatible and stateless. Accepts either a site session cookie or an
 * extension bearer token.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  // Applies whoever the keys belong to. Provider quotas are per organisation,
  // so many users cost nothing — but one runaway client would make this
  // server's egress look abusive to everyone sharing it.
  const slot = await claimRequestSlot(user.id)
  if (!slot.allowed) return tooManyRequests(slot)

  const { deps, usingOwnKeys } = await buildRouterContext(user.id, 'router')

  if (!usingOwnKeys) {
    const allowance = await claimDemoMessage(user.id)
    if (!allowance.allowed) {
      return demoExhaustedResponse(runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY)
    }
  }

  return handleChatCompletions(request, deps)
}
