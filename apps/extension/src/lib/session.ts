import { GRACE_MS, SITE_URL } from './config'
import { clearLocal, readLocal, writeLocal } from './storage'

export interface ProviderInfo {
  readonly id: string
  readonly label: string
  readonly signupUrl: string
  readonly credentialHint: string
  readonly baseUrl: string
  readonly models: { id: string; label: string; contextWindow: number }[]
  /** The user's own key, or null when they have not added one for this provider. */
  readonly key: string | null
}

export interface Session {
  readonly token: string
  readonly email: string
  readonly providers: ProviderInfo[]
  readonly demo: { remaining: number; limit: number } | null
  readonly verifiedAt: number
  /** True when the server could not be reached and the cache is carrying us. */
  readonly stale: boolean
}

const KEY = 'session'

export async function startSignIn(): Promise<Session> {
  const redirectUri = chrome.identity.getRedirectURL()
  const state = crypto.randomUUID()
  const authorizeUrl = `${SITE_URL}/extension/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`

  const finalUrl = await chrome.identity.launchWebAuthFlow({ url: authorizeUrl, interactive: true })
  if (finalUrl === undefined) throw new Error('sign-in was cancelled')

  const params = new URL(finalUrl).searchParams
  // Guards against a redirect that did not originate from the flow we started.
  if (params.get('state') !== state) throw new Error('sign-in state mismatch')

  const token = params.get('token')
  if (token === null) throw new Error('sign-in did not return a token')

  const session = await fetchAccount(token)
  if (session === null) throw new Error('the new token was rejected')
  await writeLocal(KEY, session)
  return session
}

/**
 * Refreshes against the server, and falls back to the cached copy while the
 * grace period holds. Returns null when there is nothing usable left.
 */
export async function loadSession(): Promise<Session | null> {
  const cached = await readLocal<Session>(KEY)
  if (cached === null) return null

  const fresh = await fetchAccount(cached.token).catch(() => undefined)

  if (fresh === null) {
    // Reached the server and it rejected the token: revoked or expired.
    await clearLocal(KEY)
    return null
  }

  if (fresh === undefined) {
    const withinGrace = Date.now() - cached.verifiedAt < GRACE_MS
    return withinGrace ? { ...cached, stale: true } : null
  }

  await writeLocal(KEY, fresh)
  return fresh
}

export async function signOut(): Promise<void> {
  const cached = await readLocal<Session>(KEY)
  if (cached !== null) {
    await fetch(`${SITE_URL}/api/extension/session`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${cached.token}` },
    }).catch(() => undefined)
  }
  await clearLocal(KEY)
}

/** null means the server answered and rejected the token; throws mean offline. */
async function fetchAccount(token: string): Promise<Session | null> {
  const response = await fetch(`${SITE_URL}/api/extension/me`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (response.status === 401) return null
  if (!response.ok) throw new Error(`account lookup failed: ${response.status}`)

  const body = (await response.json()) as {
    user: { email: string }
    providers: ProviderInfo[]
    demo: { remaining: number; limit: number } | null
  }

  return {
    token,
    email: body.user.email,
    providers: body.providers,
    demo: body.demo,
    verifiedAt: Date.now(),
    stale: false,
  }
}

export function ownKeyCount(session: Session): number {
  return session.providers.filter((provider) => provider.key !== null).length
}
