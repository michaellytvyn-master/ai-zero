import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  /** base64 of 32 random bytes; never stored in the database */
  KEY_ENCRYPTION_KEY: z.string().min(1),
  ADMIN_EMAILS: z.string().default(''),
  DEMO_MESSAGES_PER_ACCOUNT_PER_DAY: z.coerce.number().int().positive().default(10),
  DEMO_MODEL: z.string().min(1).default('auto'),
  FIRST_TOKEN_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  PROVIDER_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  EXTENSION_SESSION_GRACE_DAYS: z.coerce.number().int().positive().default(7),
  MISTRAL_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  CEREBRAS_API_KEY: z.string().optional(),
  CF_ACCOUNT_ID: z.string().optional(),
  CF_API_TOKEN: z.string().optional(),
})

export type Config = z.infer<typeof schema>

let cached: Config | null = null

/** Parsed on first use, not at import, so `next build` works without secrets. */
export function config(): Config {
  if (cached === null) {
    const parsed = schema.safeParse(process.env)
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
      throw new Error(`invalid environment: ${missing}. Copy .env.example to .env.local`)
    }
    cached = parsed.data
  }
  return cached
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = config()
    .ADMIN_EMAILS.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
  return allowed.includes(email.toLowerCase())
}
