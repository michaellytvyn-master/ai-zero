'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { changePassword, hasPassword } from '@/lib/accounts'
import { revokeExtensionSessionById } from '@/lib/extension-auth'
import { MIN_PASSWORD_LENGTH, WeakPasswordError } from '@/lib/password'

export interface AccountFormState {
  readonly error: string | null
  readonly done: string | null
}

const schema = z
  .object({
    current: z.string().optional(),
    next: z.string().min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters.`),
    confirm: z.string(),
  })
  .refine((values) => values.next === values.confirm, {
    message: 'The two passwords do not match.',
    path: ['confirm'],
  })

export async function updatePassword(
  _previous: AccountFormState,
  form: FormData,
): Promise<AccountFormState> {
  const user = await requireUser()
  const parsed = schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', done: null }
  }

  const existing = await hasPassword(user.id)
  if (existing && (parsed.data.current ?? '').length === 0) {
    return { error: 'Enter your current password.', done: null }
  }

  try {
    const changed = await changePassword(user.id, parsed.data.current ?? '', parsed.data.next)
    if (!changed) return { error: 'That current password is wrong.', done: null }
  } catch (error) {
    if (error instanceof WeakPasswordError) return { error: error.message, done: null }
    return { error: 'Could not update the password.', done: null }
  }

  revalidatePath('/settings/account')
  return { error: null, done: existing ? 'Password updated.' : 'Password set.' }
}

export async function revokeExtension(form: FormData): Promise<void> {
  const user = await requireUser()
  const id = form.get('id')
  if (typeof id === 'string') await revokeExtensionSessionById(user.id, id)
  revalidatePath('/settings/account')
}
