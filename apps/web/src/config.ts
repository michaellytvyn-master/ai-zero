import { z } from 'zod'

/**
 * The schema is split so that a missing variable only breaks the thing that
 * needs it. Validating everything at once meant a missing Google client id
 * took down the landing page, which needs neither Google nor a database.
 */
const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
})

const vaultSchema = z.object({
  /** base64 of 32 random bytes; never stored in the database */
  KEY_ENCRYPTION_KEY: z.string().min(1),
})

/** Reading an existing session needs this. Starting a new one needs Google too. */
const sessionSchema = z.object({
  AUTH_SECRET: z.string().min(1),
})

const googleSchema = z.object({
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
})

const runtimeSchema = z.object({
  ADMIN_EMAILS: z.string().default(''),
  DEMO_MESSAGES_PER_ACCOUNT_PER_DAY: z.coerce.number().int().positive().default(10),
  DEMO_MODEL: z.string().min(1).default('auto'),
  FIRST_TOKEN_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  PROVIDER_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  EXTENSION_SESSION_GRACE_DAYS: z.coerce.number().int().positive().default(7),
})

const operatorKeysSchema = z.object({
  GROQ_API_KEY: z.string().optional(),
  CF_ACCOUNT_ID: z.string().optional(),
  CF_API_TOKEN: z.string().optional(),
})

function slice<T extends z.ZodTypeAny>(schema: T, what: string) {
  let cached: z.infer<T> | null = null
  return (): z.infer<T> => {
    if (cached === null) {
      const parsed = schema.safeParse(process.env)
      if (!parsed.success) {
        const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
        throw new ConfigError(
          `${what} needs ${missing}. Set it in apps/web/.env.local — see .env.example.`,
        )
      }
      cached = parsed.data
    }
    return cached
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export const databaseConfig = slice(databaseSchema, 'The database')
export const vaultConfig = slice(vaultSchema, 'Storing provider keys')
export const sessionConfig = slice(sessionSchema, 'Sessions')
export const googleConfig = slice(googleSchema, 'Signing in with Google')
export const runtimeConfig = slice(runtimeSchema, 'The router')
export const operatorKeys = slice(operatorKeysSchema, 'The demo pool')

/** Lets the sign-in page explain the gap instead of the app throwing. */
export function isGoogleConfigured(): boolean {
  return googleSchema.safeParse(process.env).success
}

export function isSessionConfigured(): boolean {
  return sessionSchema.safeParse(process.env).success
}

export function isDatabaseConfigured(): boolean {
  return databaseSchema.safeParse(process.env).success
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = runtimeConfig()
    .ADMIN_EMAILS.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
  return allowed.includes(email.toLowerCase())
}
