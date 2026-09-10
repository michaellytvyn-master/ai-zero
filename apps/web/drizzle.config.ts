import { readFileSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit runs outside Next, so nothing has loaded .env.local for it. The
 * documented setup step failed with an empty url until this read it directly.
 */
function databaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv

  try {
    const line = readFileSync(new URL('.env.local', import.meta.url), 'utf8')
      .split('\n')
      .find((candidate) => candidate.startsWith('DATABASE_URL='))
    return line?.slice('DATABASE_URL='.length).trim() ?? ''
  } catch {
    return ''
  }
}

export default defineConfig({
  schema: './src/db/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl() },
})
