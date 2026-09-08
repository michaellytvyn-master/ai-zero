import { isDatabaseConfigured, isSessionConfigured } from '@/config'

/** Shown instead of crashing, so a fresh clone explains itself. */
export default function SetupNeeded() {
  const missing = [
    !isDatabaseConfigured() && 'DATABASE_URL',
    !isSessionConfigured() && 'AUTH_SECRET',
  ].filter((item): item is string => typeof item === 'string')

  return (
    <main className="wrap narrow">
      <h1>Almost configured</h1>
      <p className="muted">
        Accounts need {missing.join(' and ')} in <code>apps/web/.env.local</code>. Everything else
        on the site works without it.
      </p>
      <div className="card">
        <p style={{ marginTop: 0 }}>Generate a session secret:</p>
        <code>
          node -e
          &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64url&apos;))&quot;
        </code>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Google sign-in is optional. Add <code>AUTH_GOOGLE_ID</code> and{' '}
          <code>AUTH_GOOGLE_SECRET</code> to offer it alongside email and password.
        </p>
      </div>
    </main>
  )
}
