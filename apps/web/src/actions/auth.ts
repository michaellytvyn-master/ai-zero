'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { signIn } from '@/auth'
import { EmailTakenError, registerWithPassword } from '@/lib/accounts'
import { MIN_PASSWORD_LENGTH, WeakPasswordError } from '@/lib/password'

export interface FormState {
  readonly error: string | null
}

const signInSchema = z.object({
  email: z.string().email('That does not look like an email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

const registerSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    email: z.string().email('That does not look like an email address.'),
    password: z.string().min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters.`),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'The two passwords do not match.',
    path: ['confirm'],
  })

export async function signInWithPassword(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' }

  try {
    await signIn('password', { ...parsed.data, redirect: false })
  } catch {
    // Deliberately identical whether the address is unknown or the password is
    // wrong, so this cannot be used to find out who has an account.
    return { error: 'Wrong email or password.' }
  }

  redirect('/dashboard')
}

export async function registerAccount(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' }

  const { email, password, name } = parsed.data
  try {
    await registerWithPassword(email, password, name?.trim() || null)
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return { error: 'That email already has an account. Sign in instead.' }
    }
    if (error instanceof WeakPasswordError) return { error: error.message }
    return { error: 'Could not create the account.' }
  }

  await signIn('password', { email, password, redirect: false })
  redirect('/dashboard')
}

export async function signInWithGoogle(): Promise<void> {
  await signIn('google', { redirectTo: '/dashboard' })
}
