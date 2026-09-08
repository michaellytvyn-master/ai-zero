'use client'

import { useActionState } from 'react'
import { type AccountFormState, updatePassword } from '@/actions/account'

const EMPTY: AccountFormState = { error: null, done: null }

export default function PasswordForm(props: { needsCurrent: boolean; minLength: number }) {
  const [state, submit, pending] = useActionState(updatePassword, EMPTY)

  return (
    <form action={submit} className="stack" style={{ maxWidth: 380 }}>
      {props.needsCurrent && (
        <label className="field">
          <span>Current password</span>
          <input name="current" type="password" required autoComplete="current-password" />
        </label>
      )}
      <label className="field">
        <span>New password</span>
        <input
          name="next"
          type="password"
          required
          minLength={props.minLength}
          autoComplete="new-password"
        />
        <small className="muted">At least {props.minLength} characters.</small>
      </label>
      <label className="field">
        <span>Repeat new password</span>
        <input name="confirm" type="password" required autoComplete="new-password" />
      </label>

      {state.error !== null && <p className="error">{state.error}</p>}
      {state.done !== null && <p className="ok">{state.done}</p>}

      <button className="primary" type="submit" disabled={pending} style={{ alignSelf: 'start' }}>
        {pending ? 'Saving…' : props.needsCurrent ? 'Change password' : 'Set password'}
      </button>
    </form>
  )
}
