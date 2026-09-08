import { redirect } from 'next/navigation'
import { registerAccount, signInWithGoogle } from '@/actions/auth'
import { safeAuth } from '@/auth'
import AuthForm from '@/components/auth-form'
import SetupNeeded from '@/components/setup-needed'
import { isDatabaseConfigured, isGoogleConfigured, isSessionConfigured } from '@/config'
import { MIN_PASSWORD_LENGTH } from '@/lib/password'

export const dynamic = 'force-dynamic'

export default async function RegisterPage() {
  const session = await safeAuth()
  if (session?.user !== undefined) redirect('/dashboard')
  if (!isDatabaseConfigured() || !isSessionConfigured()) return <SetupNeeded />

  return (
    <main className="wrap narrow">
      <h1>Create an account</h1>
      <p className="muted">
        Free. You can add your own provider keys afterwards, or start on the shared pool.
      </p>
      <AuthForm
        mode="register"
        action={registerAccount}
        minPasswordLength={MIN_PASSWORD_LENGTH}
        {...(isGoogleConfigured() ? { googleAction: signInWithGoogle } : {})}
      />
    </main>
  )
}
