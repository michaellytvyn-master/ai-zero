import { desc, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { usageEvents, users } from '../db/schema'

export interface UserRow {
  readonly id: string
  readonly email: string
  readonly createdAt: Date
  readonly requests: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly lastActive: Date | null
}

/**
 * Metadata only, per DECISIONS.md section 5. There is deliberately no join to
 * the messages table here, and there must never be one.
 */
export async function userRows(): Promise<UserRow[]> {
  const rows = await db()
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
      requests: sql<number>`count(${usageEvents.id})::int`,
      inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::int`,
      lastActive: sql<Date | null>`max(${usageEvents.at})`,
    })
    .from(users)
    .leftJoin(usageEvents, eq(usageEvents.userId, users.id))
    .groupBy(users.id, users.email, users.createdAt)
    .orderBy(desc(sql`count(${usageEvents.id})`))
    .limit(200)

  return rows
}

export interface ProviderRow {
  readonly providerId: string
  readonly keyOwner: 'user' | 'operator'
  readonly requests: number
  readonly totalTokens: number
  readonly avgLatencyMs: number
  readonly failures: number
}

export async function providerRows(): Promise<ProviderRow[]> {
  const rows = await db()
    .select({
      providerId: usageEvents.providerId,
      keyOwner: usageEvents.keyOwner,
      requests: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
      avgLatencyMs: sql<number>`coalesce(round(avg(${usageEvents.latencyMs})), 0)::int`,
      failures: sql<number>`count(*) filter (where ${usageEvents.status} >= 400)::int`,
    })
    .from(usageEvents)
    .groupBy(usageEvents.providerId, usageEvents.keyOwner)
    .orderBy(desc(sql`count(*)`))

  return rows
}

export interface DailyRow {
  readonly day: string
  readonly requests: number
  readonly totalTokens: number
}

export async function dailyRows(): Promise<DailyRow[]> {
  const rows = await db()
    .select({
      day: sql<string>`to_char(${usageEvents.at}, 'YYYY-MM-DD')`,
      requests: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
    })
    .from(usageEvents)
    .where(sql`${usageEvents.at} > now() - interval '30 days'`)
    .groupBy(sql`to_char(${usageEvents.at}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${usageEvents.at}, 'YYYY-MM-DD') desc`)

  return rows
}
