import { DrizzleAdapter } from '@auth/drizzle-adapter'
import NextAuth, { type Session } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { z } from 'zod'
import { isDatabaseConfigured, isGoogleConfigured, isSessionConfigured } from './config'
import { db } from './db'
import { accounts, sessions, users, verificationTokens } from './db/schema'
import { authenticate } from './lib/accounts'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(db(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Credentials({
      id: 'password',
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null
        return authenticate(parsed.data.email, parsed.data.password)
      },
    }),
    // Configuring Google adds a second way in. Without it, email and password
    // still work, and the sign-in page simply omits the button.
    ...(isGoogleConfigured()
      ? [
          Google({
            // Safe here specifically because Google verifies email ownership:
            // it lets one person use both methods for the same address instead
            // of ending up with two accounts.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  // Credentials sign-in cannot use database sessions, so both methods share the
  // JWT strategy. The extension has its own bearer tokens either way.
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin' },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id !== undefined) token.sub = user.id
      return token
    },
    session({ session, token }) {
      if (typeof token.sub === 'string') session.user.id = token.sub
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
