import { auth } from '../auth'
import { bearerToken, userForExtensionToken, type ExtensionUser } from './extension-auth'

/**
 * The extension sends a bearer token; the site sends a session cookie. Routes
 * shared by both resolve the user through here.
 */
export async function resolveUser(request: Request): Promise<ExtensionUser | null> {
  const token = bearerToken(request)
  if (token !== null) return userForExtensionToken(token)

  const session = await auth()
  const id = session?.user?.id
  const email = session?.user?.email
  if (typeof id !== 'string' || typeof email !== 'string') return null
  return { id, email }
}
