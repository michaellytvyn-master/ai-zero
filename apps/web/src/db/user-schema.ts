import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * The tables this service creates in a user's own database — their chat
 * history, and nothing else. Prefixed so a database that already holds other
 * tables is not disturbed.
 *
 * No foreign key to a users table: that table lives in the operator's
 * database. user_id is kept all the same, so a database two accounts share
 * still separates them, and every query filters by it.
 *
 * The DDL that creates these is USER_SCHEMA_DDL in lib/user-database.ts, and a
 * test holds the two in step.
 */
export const zcaConversations = pgTable(
  'zca_conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    title: text('title').notNull().default('New chat'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('zca_conversation_user_updated').on(table.userId, table.updatedAt)],
)

export const zcaMessages = pgTable(
  'zca_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => zcaConversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['system', 'user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    providerId: text('provider_id'),
    model: text('model'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('zca_message_conversation_created').on(table.conversationId, table.createdAt)],
)
