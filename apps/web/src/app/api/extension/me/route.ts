import { orderedProviders } from '@zca/providers'
import { resolveUser } from '@/lib/request-user'
import { decryptedKeys } from '@/lib/provider-keys'
import { unauthenticatedResponse } from '@/lib/responses'
import { demoRemaining } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Hands the extension its own user's provider keys in plaintext, over TLS, to
 * an authenticated bearer token. That is what direct mode needs: the extension
 * calls providers itself, so it must hold the key. Nothing here is logged, and
 * a token only ever unlocks the keys of the user it belongs to.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await resolveUser(request)
  if (user === null) return unauthenticatedResponse()

  const keys = await decryptedKeys(user.id)
  // Counted across model providers only. The same vault also holds a Cloudinary
  // credential for image storage, and connecting somewhere to keep pictures
  // must not make the panel claim the user is running on their own keys.
  const usingOwnKeys = orderedProviders().some((provider) => keys.has(provider.id))
  const allowance = usingOwnKeys ? null : await demoRemaining(user.id)

  return Response.json(
    {
      user: { email: user.email },
      providers: orderedProviders().map((provider) => ({
        id: provider.id,
        label: provider.label,
        signupUrl: provider.signupUrl,
        credentialHint: provider.credentialHint,
        models: provider.models.map((model) => ({
          id: model.id,
          label: model.label,
          contextWindow: model.contextWindow,
        })),
        baseUrl: provider.baseUrl,
        // Sent so the panel can warn at the moment of use. It matters more here
        // than on the website: page reading hands the provider the page the
        // user is looking at.
        ...(provider.privacyWarning !== undefined && {
          privacyWarning: provider.privacyWarning,
        }),
        key: keys.get(provider.id) ?? null,
      })),
      demo: allowance === null ? null : { remaining: allowance.remaining, limit: allowance.limit },
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
