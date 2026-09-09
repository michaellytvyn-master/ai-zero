'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  challengePassed,
  credentialsMatch,
  endAdminSession,
  startAdminSession,
  tooManyAttempts,
} from '@/lib/admin-auth'

export interface AdminLoginState {
  readonly error: string | null
}

/** Best available identifier behind a proxy; the throttle is per caller. */
async function callerKey(): Promise<string> {
  const store = await headers()
  const forwarded = store.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded ?? store.get('x-real-ip') ?? 'unknown'
}

export async function signInAdmin(
  _previous: AdminLoginState,
  form: FormData,
): Promise<AdminLoginState> {
  // Counted before anything is checked, so a wrong answer costs an attempt and
  // guessing cannot be made cheap by failing early.
  if (await tooManyAttempts(await callerKey())) {
    return { error: 'Too many attempts. Wait a minute.' }
  }

  const answer = String(form.get('answer') ?? '')
  const token = String(form.get('challenge') ?? '')
  if (!challengePassed(token, answer)) {
    return { error: 'That answer was wrong or the question expired.' }
  }

  const username = String(form.get('username') ?? '')
  const password = String(form.get('password') ?? '')
  if (!credentialsMatch(username, password)) {
    // Deliberately identical whichever half was wrong.
    return { error: 'Wrong username or password.' }
  }

  await startAdminSession()
  redirect('/admin')
}

export async function signOutAdmin(): Promise<void> {
  await endAdminSession()
  redirect('/admin/login')
}
