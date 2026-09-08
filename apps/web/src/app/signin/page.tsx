import { redirect } from 'next/navigation'
import { safeAuth, signIn } from '@/auth'
import { isDatabaseConfigured, isGoogleConfigured, isSessionConfigured } from '@/config'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  const session = await safeAuth()
  if (session?.user !== undefined) redirect('/chat')

  if (!isGoogleConfigured() || !isDatabaseConfigured() || !isSessionConfigured()) {
    return <SetupNeeded />
  }

  return (
    <main className="wrap">
      <h1>Sign in</h1>
      <p className="muted">
        An account holds your chat history and your encrypted provider keys, and it is what the
        Chrome extension signs in against.
      </p>
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/chat' })
        }}
      >
        <button className="primary" type="submit">
          Continue with Google
        </button>
      </form>
    </main>
  )
}

/** Shown instead of crashing, so a fresh clone explains itself. */
function SetupNeeded() {
  const missing = [
    !isDatabaseConfigured() && 'DATABASE_URL',
    !isSessionConfigured() && 'AUTH_SECRET',
    !isGoogleConfigured() && 'AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET',
  ].filter((item): item is string => typeof item === 'string')

  return (
    <main className="wrap">
      <h1>Sign-in is not configured yet</h1>
      <p className="muted">
        The rest of the site works without this. To turn sign-in on, set {missing.join(', ')} in{' '}
        <code>apps/web/.env.local</code>.
      </p>

      <div className="card">
        <p style={{ marginTop: 0 }}>
          Create an OAuth client at Google Cloud Console, under Credentials, as a Web application,
          with this redirect URI:
        </p>
        <code>http://localhost:3000/api/auth/callback/google</code>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Then generate a secret with{' '}
          <code>
            node -e
            &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64url&apos;))&quot;
          </code>{' '}
          and restart the dev server.
        </p>
      </div>
    </main>
  )
}
