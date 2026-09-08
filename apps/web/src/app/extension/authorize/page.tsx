import { redirect } from 'next/navigation'
import { safeAuth } from '@/auth'
import { issueExtensionToken } from '@/lib/extension-auth'

export const dynamic = 'force-dynamic'

/**
 * chrome.identity.launchWebAuthFlow finishes when the browser reaches a URL
 * under the extension's own chromiumapp.org origin. Anything else would turn
 * this page into an open redirect that leaks a bearer token, so the shape is
 * checked rather than trusted: extension ids are exactly 32 letters a-p.
 */
const REDIRECT_PATTERN = /^https:\/\/[a-p]{32}\.chromiumapp\.org\/?$/

export default async function AuthorizeExtensionPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_uri?: string; state?: string }>
}) {
  const { redirect_uri: redirectUri, state } = await searchParams

  if (redirectUri === undefined || !REDIRECT_PATTERN.test(redirectUri)) {
    return (
      <main className="wrap">
        <h1>Invalid request</h1>
        <p className="muted">
          This page can only be opened by the Zero-Cost AI extension. Open the side panel and press
          sign in there.
        </p>
      </main>
    )
  }

  const session = await safeAuth()
  const userId = session?.user?.id
  if (typeof userId !== 'string') {
    const target = `/extension/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state ?? '')}`
    redirect(`/signin?callbackUrl=${encodeURIComponent(target)}`)
  }

  async function approve() {
    'use server'
    const token = await issueExtensionToken(userId as string)
    const destination = new URL(redirectUri as string)
    destination.searchParams.set('token', token)
    if (state !== undefined) destination.searchParams.set('state', state)
    redirect(destination.toString())
  }

  return (
    <main className="wrap">
      <h1>Connect the extension</h1>
      <p className="muted">
        Signed in as {session?.user?.email}. Allowing this lets the extension chat on your account,
        and use provider keys you have added, on this browser.
      </p>
      <div className="card">
        <p style={{ marginTop: 0 }}>The extension will be able to:</p>
        <ul>
          <li>send messages using your account and your saved provider keys</li>
          <li>report which provider answered, and how many tokens it used</li>
        </ul>
        <p className="muted" style={{ fontSize: 13 }}>
          You can revoke this from the extension&apos;s settings at any time.
        </p>
      </div>
      <form action={approve}>
        <button className="primary" type="submit">
          Allow
        </button>
      </form>
    </main>
  )
}
