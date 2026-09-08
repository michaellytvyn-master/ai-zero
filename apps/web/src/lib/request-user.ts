import { safeAuth } from '../auth'
import { looksLikeApiKey, userForApiKey } from './api-keys'
import { type ExtensionUser, bearerToken, userForExtensionToken } from './extension-auth'

/**
 * Three ways in, all landing on the same account: a session cookie from the
 * site, an extension token, and an API key the user made for their own code.
 * The key's prefix tells the last two apart without a database round trip.
 */
export async function resolveUser(request: Request): Promise<ExtensionUser | null> {
  const token = bearerToken(request)
  if (token !== null) {
    return looksLikeApiKey(token) ? userForApiKey(token) : userForExtensionToken(token)
  }

  const session = await safeAuth()
  const id = session?.user?.id
  const email = session?.user?.email
  if (typeof id !== 'string' || typeof email !== 'string') return null
  return { id, email }
}
