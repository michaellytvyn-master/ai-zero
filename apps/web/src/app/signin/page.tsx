import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'

export default async function SignInPage() {
  const session = await auth()
  if (session?.user !== undefined) redirect('/chat')

  return (
    <main className="wrap">
      <h1>Sign in</h1>
      <p className="muted">
        An account holds your chat history and your encrypted provider keys, and it is what the
        Chrome extension signs in against.
      </p>
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/chat' })
        }}
      >
        <button className="primary" type="submit">
          Continue with Google
        </button>
      </form>
    </main>
  )
}
