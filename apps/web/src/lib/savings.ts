import { and, eq, gte, sql } from 'drizzle-orm'
import type { UsageTotal } from '@zca/pricing'
import { db } from '../db'
import { usageEvents } from '../db/schema'

/**
 * Failed calls are excluded. They produced no tokens, so they add nothing to
 * the estimate, but counting them would inflate the request number into
 * something that does not correspond to an answer anybody received.
 */
const SUCCEEDED = sql`${usageEvents.status} < 400`

export async function usageTotalsForUser(userId: string): Promise<UsageTotal[]> {
  const rows = await db()
    .select({
      providerId: usageEvents.providerId,
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::int`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), SUCCEEDED))
    .groupBy(usageEvents.providerId)

  return rows
}

export async function usageTotalsForEveryone(): Promise<UsageTotal[]> {
  const rows = await db()
    .select({
      providerId: usageEvents.providerId,
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::int`,
    })
    .from(usageEvents)
    .where(SUCCEEDED)
    .groupBy(usageEvents.providerId)

  return rows
}

export async function usageTotalsSince(userId: string, since: Date): Promise<UsageTotal[]> {
  const rows = await db()
    .select({
      providerId: usageEvents.providerId,
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::int`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.at, since), SUCCEEDED))
    .groupBy(usageEvents.providerId)

  return rows
}
