import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { safeAuth } from '@/auth'
import { extensionAllowed, extensionIdFrom, issueExtensionToken } from '@/lib/extension-auth'

export const metadata: Metadata = {
  title: 'Authorize the extension',
  // Behind a sign-in; robots.txt disallows it too, but a disallowed URL can
  // still be indexed from an external link — only the tag actually prevents it.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AuthorizeExtensionPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_uri?: string; state?: string }>
}) {
  const { redirect_uri: redirectUri, state } = await searchParams
  const extensionId = extensionIdFrom(redirectUri)

  // The same answer for a malformed address and an extension not on the list,
  // so the page cannot be used to learn which ids are allowed.
  if (extensionId === null || !extensionAllowed(extensionId)) {
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

  // Rebuilt from the validated id rather than echoing what was sent, so the
  // token can only ever go to that extension's own origin.
  const returnTo = `https://${extensionId}.chromiumapp.org/`

  const session = await safeAuth()
  const userId = session?.user?.id
  if (typeof userId !== 'string') {
    const target = `/extension/authorize?redirect_uri=${encodeURIComponent(returnTo)}&state=${encodeURIComponent(state ?? '')}`
    redirect(`/signin?callbackUrl=${encodeURIComponent(target)}`)
  }

  async function approve() {
    'use server'
    const token = await issueExtensionToken(userId as string)
    const destination = new URL(returnTo)
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
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Asking extension: <code>{extensionId}</code>. It should match the ID shown for Zero-Cost
          AI at <code>chrome://extensions</code>. If it does not, another extension opened this page
          — do not allow it.
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
