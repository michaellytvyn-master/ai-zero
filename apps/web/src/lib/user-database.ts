import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool, type PoolConfig } from 'pg'
import * as userSchema from '../db/user-schema'
import { isPublicAddress } from './safe-address'

/**
 * A user's own Postgres, where their chat history lives. The operator's
 * database keeps only accounts, encrypted keys, trial allowances and usage
 * metadata; conversations go here.
 *
 * Connecting to an address a user typed is a request-forgery primitive in the
 * same way fetching a link is: point it at 10.0.0.5 or the metadata endpoint
 * and the server would open a socket inside its own network. So the host is
 * resolved once, every address it resolves to must be public, and the
 * connection is made to that resolved address — a name that resolves publicly
 * at the check and privately a moment later (DNS rebinding) is never
 * re-resolved. TLS still validates against the original name, because pg
 * keeps an explicit `ssl.servername` when connecting to an IP.
 */

export type UserDatabase = ReturnType<typeof drizzle<typeof userSchema>>

export class UserDatabaseError extends Error {
  /** Safe to show the user: no credentials, no internal addresses. */
  constructor(readonly userMessage: string) {
    super(userMessage)
    this.name = 'UserDatabaseError'
  }
}

export interface ParsedDatabaseUrl {
  readonly host: string
  readonly port: number
  readonly user: string
  readonly password: string
  readonly database: string
  /** libpq semantics: 'verify' checks the certificate, 'encrypt' only encrypts. */
  readonly tls: 'verify' | 'encrypt' | 'none'
  /** Neon accepts its endpoint id here when SNI is unavailable. */
  readonly options: string | null
}

/**
 * Only for running the integration suite against a local, unencrypted
 * Postgres. Inert in production whatever the environment says, so a
 * misconfigured deployment cannot quietly open the private network again.
 */
export function insecureLocalAllowed(env = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.USER_DATABASE_INSECURE_LOCAL === 'true'
}

export function parseDatabaseUrl(
  raw: string,
  allowInsecure = insecureLocalAllowed(),
): ParsedDatabaseUrl {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new UserDatabaseError('That is not a database address. It should start with postgres://')
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new UserDatabaseError('Only Postgres is supported. The address starts with postgres://')
  }
  const user = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (url.hostname === '' || user === '' || database === '') {
    throw new UserDatabaseError('The address needs a host, a user and a database name.')
  }
  if (password === '') {
    throw new UserDatabaseError('The address has no password. A hosted database always needs one.')
  }

  const port = url.port === '' ? 5432 : Number(url.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UserDatabaseError('The port in that address is not valid.')
  }

  const sslmode = (url.searchParams.get('sslmode') ?? '').toLowerCase()
  const tls: ParsedDatabaseUrl['tls'] =
    sslmode === 'disable'
      ? 'none'
      : sslmode === 'require' || sslmode === 'prefer' || sslmode === 'allow'
        ? 'encrypt'
        : 'verify'
  if (tls === 'none' && !allowInsecure) {
    // Conversations would cross the internet in the clear.
    throw new UserDatabaseError('An unencrypted connection (sslmode=disable) is not allowed.')
  }

  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port,
    user,
    password,
    database,
    tls,
    options: url.searchParams.get('options'),
  }
}

/**
 * Resolves the host and refuses it if any address it maps to is private. All
 * of them are checked, not just the first: a name with one public and one
 * private record would otherwise be a coin toss.
 */
export async function resolvePublicHost(
  host: string,
  allowPrivate = insecureLocalAllowed(),
  resolve: (name: string) => Promise<{ address: string }[]> = (name) =>
    lookup(name, { all: true, verbatim: true }),
): Promise<string> {
  let addresses: { address: string }[]
  try {
    addresses = await resolve(host)
  } catch {
    throw new UserDatabaseError(`The host ${host} could not be found.`)
  }
  const first = addresses[0]?.address
  if (first === undefined) throw new UserDatabaseError(`The host ${host} could not be found.`)

  if (!allowPrivate && addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new UserDatabaseError(
      'That address points inside a private network. Use your database provider’s public address.',
    )
  }
  return first
}

export function poolConfig(parsed: ParsedDatabaseUrl, address: string): PoolConfig {
  return {
    host: address,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    ...(parsed.options === null ? {} : { options: parsed.options }),
    ssl:
      parsed.tls === 'none'
        ? false
        : { servername: parsed.host, rejectUnauthorized: parsed.tls === 'verify' },
    // Small on purpose: this is one person's history, on a serverless host
    // where every warm instance holds its own pool.
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 6_000,
    statement_timeout: 10_000,
    application_name: 'zero-cost-ai',
  }
}

// ---------------------------------------------------------------------------
// A small cache of pools, keyed by the address, so a warm server does not
// open a new connection for every message. Bounded, because each entry holds
// sockets to somebody's database.
// ---------------------------------------------------------------------------

const MAX_POOLS = 40
const globalForPools = globalThis as unknown as {
  zcaUserPools?: Map<string, { pool: Pool; db: UserDatabase }>
}
// Kept on globalThis so a hot reload in development does not leak pools.
globalForPools.zcaUserPools ??= new Map()
const pools = globalForPools.zcaUserPools

function cacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

export async function userDatabase(url: string): Promise<UserDatabase> {
  const key = cacheKey(url)
  const cached = pools.get(key)
  if (cached !== undefined) {
    // Re-insert to mark it most recently used.
    pools.delete(key)
    pools.set(key, cached)
    return cached.db
  }

  const parsed = parseDatabaseUrl(url)
  const address = await resolvePublicHost(parsed.host)
  const pool = new Pool(poolConfig(parsed, address))
  // Without a listener an idle client's network error crashes the process.
  pool.on('error', () => {
    pools.delete(key)
    void pool.end().catch(() => {})
  })

  const entry = { pool, db: drizzle(pool, { schema: userSchema }) }
  pools.set(key, entry)
  while (pools.size > MAX_POOLS) {
    const oldest = pools.keys().next().value
    if (oldest === undefined) break
    const evicted = pools.get(oldest)
    pools.delete(oldest)
    void evicted?.pool.end().catch(() => {})
  }
  return entry.db
}

/** Closes a cached pool, for when the user disconnects or replaces the address. */
export async function forgetUserDatabase(url: string): Promise<void> {
  const key = cacheKey(url)
  const entry = pools.get(key)
  pools.delete(key)
  await entry?.pool.end().catch(() => {})
}

// ---------------------------------------------------------------------------
// The schema created in the user's database. Prefixed, so that a database that
// already holds other tables is not disturbed; idempotent, so reconnecting is
// harmless. Kept in step with db/user-schema.ts by a test.
// ---------------------------------------------------------------------------

export const USER_SCHEMA_VERSION = 1

export const USER_SCHEMA_DDL = `
create table if not exists zca_schema (version integer not null);

create table if not exists zca_conversation (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists zca_conversation_user_updated on zca_conversation (user_id, updated_at);

create table if not exists zca_message (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references zca_conversation (id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null,
  provider_id text,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists zca_message_conversation_created on zca_message (conversation_id, created_at);
`

/**
 * Connects, checks the server can hold the schema, and creates it. Every
 * failure is translated into something a person can act on; the raw driver
 * error can name internal hosts and is not shown.
 */
export async function prepareUserDatabase(
  url: string,
): Promise<{ host: string; database: string }> {
  const parsed = parseDatabaseUrl(url)
  const address = await resolvePublicHost(parsed.host)
  const pool = new Pool({ ...poolConfig(parsed, address), max: 1 })
  pool.on('error', () => {})

  try {
    const client = await pool.connect().catch((error: unknown) => {
      throw new UserDatabaseError(explainConnectError(error))
    })
    try {
      const version = await client.query<{ server_version_num: string }>('show server_version_num')
      if (Number(version.rows[0]?.server_version_num ?? 0) < 130000) {
        throw new UserDatabaseError('Postgres 13 or newer is needed.')
      }
      await client.query('begin')
      try {
        await client.query(USER_SCHEMA_DDL)
        await client.query('delete from zca_schema')
        await client.query('insert into zca_schema (version) values ($1)', [USER_SCHEMA_VERSION])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback').catch(() => {})
        if (/permission denied/i.test(String(error))) {
          throw new UserDatabaseError(
            'That user cannot create tables. Use a role that owns the database, or grant it CREATE.',
          )
        }
        throw new UserDatabaseError('The tables could not be created in that database.')
      }
    } finally {
      client.release()
    }
  } finally {
    await pool.end().catch(() => {})
  }

  return { host: parsed.host, database: parsed.database }
}

function explainConnectError(error: unknown): string {
  const text = String((error as { message?: unknown })?.message ?? error)
  if (/password authentication failed/i.test(text)) return 'The user name or password is wrong.'
  if (/does not exist/i.test(text)) return 'That database does not exist on the server.'
  if (/self[- ]signed|unable to verify|certificate/i.test(text)) {
    return (
      'The server’s certificate could not be verified. If your provider signs its own ' +
      'certificates, add ?sslmode=require to encrypt without checking it.'
    )
  }
  if (/timeout|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH/i.test(text)) {
    return 'The database did not answer. Check the host and port, and that it accepts outside connections.'
  }
  if (/SSL|TLS/i.test(text)) return 'The server would not open an encrypted connection.'
  return 'Could not connect to that database.'
}

/** What the settings page shows: where, never the credentials. */
export function describeDatabase(url: string): string {
  try {
    const parsed = parseDatabaseUrl(url, true)
    return `${parsed.host} / ${parsed.database}`
  } catch {
    return 'your database'
  }
}
