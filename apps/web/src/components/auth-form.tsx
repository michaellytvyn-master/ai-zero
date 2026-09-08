'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import type { FormState } from '@/actions/auth'

const EMPTY: FormState = { error: null }

export default function AuthForm(props: {
  mode: 'signin' | 'register'
  action: (previous: FormState, form: FormData) => Promise<FormState>
  googleAction?: () => Promise<void>
  minPasswordLength: number
}) {
  const [state, submit, pending] = useActionState(props.action, EMPTY)
  const registering = props.mode === 'register'

  return (
    <>
      <form action={submit} className="stack">
        {registering && (
          <label className="field">
            <span>Name</span>
            <input name="name" autoComplete="name" placeholder="Optional" />
          </label>
        )}

        <label className="field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={registering ? props.minPasswordLength : undefined}
            autoComplete={registering ? 'new-password' : 'current-password'}
          />
          {registering && (
            <small className="muted">
              At least {props.minPasswordLength} characters. Length matters more than symbols.
            </small>
          )}
        </label>

        {registering && (
          <label className="field">
            <span>Repeat password</span>
            <input name="confirm" type="password" required autoComplete="new-password" />
          </label>
        )}

        {state.error !== null && <p className="error">{state.error}</p>}

        <button className="primary" type="submit" disabled={pending}>
          {pending ? 'Working…' : registering ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {props.googleAction !== undefined && (
        <>
          <div className="divider">
            <span>or</span>
          </div>
          <form action={props.googleAction}>
            <button type="submit" style={{ width: '100%' }}>
              Continue with Google
            </button>
          </form>
        </>
      )}

      <p className="muted" style={{ marginTop: 18 }}>
        {registering ? (
          <>
            Already have an account? <Link href="/signin">Sign in</Link>
          </>
        ) : (
          <>
            No account yet? <Link href="/register">Create one</Link>
          </>
        )}
      </p>
    </>
  )
}
