import { handleChatCompletions } from '@zca/router-core'
import { UnauthenticatedError, requireUser } from '@/auth'
import { config } from '@/config'
import { buildRouterContext } from '@/lib/router-deps'
import { demoExhaustedResponse, unauthenticatedResponse } from '@/lib/responses'
import { claimDemoMessage } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** OpenAI-compatible and stateless. Used by the extension and API clients. */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser()
    const { deps, usingOwnKeys } = await buildRouterContext(user.id, 'router')

    if (!usingOwnKeys) {
      const allowance = await claimDemoMessage(user.id)
      if (!allowance.allowed) {
        return demoExhaustedResponse(config().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY)
      }
    }

    return await handleChatCompletions(request, deps)
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticatedResponse()
    throw error
  }
}
