import { redirect } from 'next/navigation'
import { signInWithGoogle, signInWithPassword } from '@/actions/auth'
import { safeAuth } from '@/auth'
import AuthForm from '@/components/auth-form'
import SetupNeeded from '@/components/setup-needed'
import { isDatabaseConfigured, isGoogleConfigured, isSessionConfigured } from '@/config'
import { MIN_PASSWORD_LENGTH } from '@/lib/password'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  const session = await safeAuth()
  if (session?.user !== undefined) redirect('/settings')
  if (!isDatabaseConfigured() || !isSessionConfigured()) return <SetupNeeded />

  return (
    <main className="wrap narrow">
      <h1>Sign in</h1>
      <p className="muted">Your conversations, keys and usage are on your account.</p>
      <AuthForm
        mode="signin"
        action={signInWithPassword}
        minPasswordLength={MIN_PASSWORD_LENGTH}
        {...(isGoogleConfigured() ? { googleAction: signInWithGoogle } : {})}
      />
    </main>
  )
}
