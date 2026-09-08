import { DrizzleAdapter } from '@auth/drizzle-adapter'
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db } from './db'
import { accounts, sessions, users, verificationTokens } from './db/schema'

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(db(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  session: { strategy: 'database' },
  pages: { signIn: '/signin' },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
}))

/** Throws rather than returning null, for routes that must have a user. */
export async function requireUser(): Promise<{ id: string; email: string }> {
  const session = await auth()
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
