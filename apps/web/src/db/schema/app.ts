import { sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './auth'

export const messageRole = pgEnum('message_role', ['system', 'user', 'assistant'])
export const usageSource = pgEnum('usage_source', ['router', 'direct'])
/** Whose quota paid for the call: the signed-in user's key, or the demo pool. */
export const keyOwner = pgEnum('key_owner', ['user', 'operator'])

/**
 * Provider keys belong to the user and are encrypted at rest. `secret` holds
 * the whole envelope (`v1.<iv>.<tag>.<ciphertext>`); the key that opens it
 * lives in KEY_ENCRYPTION_KEY, never in this database. `hint` is the last few
 * characters, so the UI can identify a key without decrypting anything.
 */
export const providerKeys = pgTable(
  'provider_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    secret: text('secret').notNull(),
    hint: text('hint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastStatus: integer('last_status'),
  },
  (table) => [uniqueIndex('provider_key_user_provider').on(table.userId, table.providerId)],
)

export const conversations = pgTable(
  'conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New chat'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('conversation_user_updated').on(table.userId, table.updatedAt)],
)

/**
 * The user's own chat history, shown back to them in their account and
 * deletable by them. This is product data they own — it is not telemetry, and
 * it is never surfaced in the admin dashboard.
 */
export const messages = pgTable(
  'message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: messageRole('role').notNull(),
    content: text('content').notNull(),
    providerId: text('provider_id'),
    model: text('model'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('message_conversation_created').on(table.conversationId, table.createdAt)],
)

/** Metadata only. Adding a content column here breaks hard constraint 3. */
export const usageEvents = pgTable(
  'usage_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    providerId: text('provider_id').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    status: integer('status').notNull(),
    source: usageSource('source').notNull(),
    keyOwner: keyOwner('key_owner').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('usage_event_user_at').on(table.userId, table.at),
    index('usage_event_at').on(table.at),
  ],
)

/** Replaces SPEC.md's Workers KV cooldowns. */
export const providerCooldowns = pgTable('provider_cooldown', {
  providerId: text('provider_id').primaryKey(),
  until: timestamp('until', { withTimezone: true }).notNull(),
})

/**
 * Counted separately from usage_event so the cap is enforced before the call
 * rather than after it, which a post-hoc count would race on.
 */
export const demoUsage = pgTable(
  'demo_usage',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [uniqueIndex('demo_usage_user_day').on(table.userId, table.day)],
)

/** Bearer tokens the Chrome extension holds; see DECISIONS.md section 6. */
export const extensionSessions = pgTable(
  'extension_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('extension_session_user').on(table.userId)],
)

/**
 * Generated images live for an hour and then go, so a free Cloudinary account
 * is not filled up by pictures nobody came back for. Only where the file is
 * and when it dies — the prompt is already in the conversation.
 */
export const generatedImages = pgTable(
  'generated_image',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    publicId: text('public_id').notNull(),
    url: text('url').notNull(),
    model: text('model').notNull(),
    bytes: integer('bytes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('generated_image_expiry').on(table.expiresAt)],
)

/**
 * Keys users create to call this service from their own code. Only the hash is
 * stored, so a database dump yields no working key; `prefix` is the visible
 * part, enough to tell two keys apart in a list.
 */
export const apiKeys = pgTable(
  'api_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    prefix: text('prefix').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('api_key_user').on(table.userId)],
)

/**
 * A per-minute ceiling on every account, own keys or not. Provider quotas are
 * per organisation, so many polite users cost us nothing — but one runaway
 * script would make this server's egress look like an attack to whoever is in
 * front of the provider's API, and that is shared with every other user.
 */
export const requestWindows = pgTable(
  'request_window',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Truncated to the minute, so old rows are trivially identifiable. */
    minute: timestamp('minute', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [uniqueIndex('request_window_user_minute').on(table.userId, table.minute)],
)
