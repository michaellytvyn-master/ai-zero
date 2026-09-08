import { useState } from 'react'
import { startSignIn, type Session } from '@/lib/session'

export default function SignIn({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="centered">
      <h3>Zero-Cost AI</h3>
      <p className="muted">Sign in with the account you use on the site.</p>
      <button
        type="button"
        className="primary"
        onClick={() => {
          void startSignIn()
            .then(onSignedIn)
            .catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : 'Sign-in failed.'),
            )
        }}
      >
        Sign in
      </button>
      {error !== null && <p className="muted">{error}</p>}
    </div>
  )
}
