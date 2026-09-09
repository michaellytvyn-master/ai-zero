'use client'

import { useActionState } from 'react'
import { type AdminLoginState, signInAdmin } from '@/app/admin/actions'

const EMPTY: AdminLoginState = { error: null }

export default function AdminLoginForm({ question, token }: { question: string; token: string }) {
  const [state, submit, pending] = useActionState(signInAdmin, EMPTY)

  return (
    <form action={submit} className="stack">
      <input type="hidden" name="challenge" value={token} />

      <label className="field">
        <span>Username</span>
        <input name="username" required autoComplete="off" />
      </label>

      <label className="field">
        <span>Password</span>
        <input name="password" type="password" required autoComplete="off" />
      </label>

      <label className="field">
        <span>What is {question}?</span>
        <input name="answer" required inputMode="numeric" autoComplete="off" />
        <small className="muted">Slows down anything guessing at the password.</small>
      </label>

      {state.error !== null && <p className="error">{state.error}</p>}

      <button className="primary" type="submit" disabled={pending}>
        {pending ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  )
}
