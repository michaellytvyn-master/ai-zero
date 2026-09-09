import { redirect } from 'next/navigation'
import AdminLoginForm from '@/components/admin-login-form'
import { isAdminConfigured, isAdminSignedIn, makeChallenge } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Operator', robots: { index: false, follow: false } }

export default async function AdminLoginPage() {
  if (await isAdminSignedIn()) redirect('/admin')

  if (!isAdminConfigured()) {
    return (
      <main className="wrap narrow">
        <h1>Operator area</h1>
        <p className="muted">
          Set <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD</code> in the environment to
          enable it. Until then there is nothing to sign in to, which is the safe default.
        </p>
      </main>
    )
  }

  // A fresh question each render, signed and short-lived, so the server keeps
  // no state and an old page cannot be replayed.
  const challenge = makeChallenge()

  return (
    <main className="wrap narrow">
      <h1>Operator</h1>
      <p className="muted">This area is not part of any user account.</p>
      <AdminLoginForm question={challenge.question} token={challenge.token} />
    </main>
  )
}
