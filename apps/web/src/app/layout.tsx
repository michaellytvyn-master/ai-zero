import type { Metadata } from 'next'
import Link from 'next/link'
import { safeAuth } from '@/auth'
import { isAdmin } from '@/config'
import './globals.css'

export const metadata: Metadata = {
  title: 'Zero-Cost AI',
  description: 'A chat that runs on free LLM provider tiers, with automatic failover.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await safeAuth()
  const email = session?.user?.email ?? null

  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/">Zero-Cost AI</Link>
          {email !== null && <Link href="/chat">Chat</Link>}
          {email !== null && <Link href="/account">Keys</Link>}
          {email !== null && <Link href="/savings">Saved</Link>}
          {isAdminSafe(email) && <Link href="/admin">Admin</Link>}
          <span className="spacer" />
          <Link href="/privacy" className="muted">
            Privacy
          </Link>
          {email === null ? (
            <Link href="/signin">Sign in</Link>
          ) : (
            <span className="muted">{email}</span>
          )}
        </nav>
        {children}
      </body>
    </html>
  )
}

/** Runtime config has defaults for everything, but a bad value must not 500. */
function isAdminSafe(email: string | null): boolean {
  try {
    return isAdmin(email)
  } catch {
    return false
  }
}
