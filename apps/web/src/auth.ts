import { DrizzleAdapter } from '@auth/drizzle-adapter'
import NextAuth, { type Session } from 'next-auth'
import Google from 'next-auth/providers/google'
import { isDatabaseConfigured, isGoogleConfigured, isSessionConfigured } from './config'
import { db } from './db'
import { accounts, sessions, users, verificationTokens } from './db/schema'

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(db(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Configuring Google is what turns sign-in on. Without it the rest of the
  // site still renders; only the sign-in page changes what it says.
  providers: isGoogleConfigured() ? [Google] : [],
  session: { strategy: 'database' },
  pages: { signIn: '/signin' },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
}))

/**
 * Returns null instead of throwing when the environment is incomplete, so a
 * half-configured install shows the site and its setup instructions rather
 * than a stack trace on every page.
 */
export async function safeAuth(): Promise<Session | null> {
  // Reading a session needs a secret and a database. The Google credentials
  // only decide whether a new session can be started, so gating on them here
  // would log everyone out the moment sign-in was reconfigured.
  if (!isSessionConfigured() || !isDatabaseConfigured()) return null
  try {
    return await auth()
  } catch {
    return null
  }
}

export async function requireUser(): Promise<{ id: string; email: string }> {
  const session = await safeAuth()
  const id = session?.user?.id
  const email = session?.user?.email
  if (typeof id !== 'string' || typeof email !== 'string') throw new UnauthenticatedError()
  return { id, email }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('not signed in')
    this.name = 'UnauthenticatedError'
  }
}
