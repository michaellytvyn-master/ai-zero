import { and, eq, sql } from 'drizzle-orm'
import type { UsageEvent } from '@zca/shared'
import { runtimeConfig } from '../config'
import { db } from '../db'
import { demoUsage, usageEvents } from '../db/schema'

export async function recordUsage(userId: string | null, event: UsageEvent): Promise<void> {
  await db()
    .insert(usageEvents)
    .values({
      userId,
      providerId: event.providerId,
      model: event.model,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      latencyMs: event.latencyMs,
      status: event.status,
      source: event.source,
      keyOwner: event.keyOwner,
      at: new Date(event.at),
    })
}

export interface DemoAllowance {
  readonly allowed: boolean
  readonly remaining: number
  readonly limit: number
}

/**
 * Claims one demo message atomically. The conditional upsert means two
 * concurrent requests cannot both slip past the last slot, which a
 * read-then-write check would allow.
 */
export async function claimDemoMessage(userId: string): Promise<DemoAllowance> {
  const limit = runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY
  const claimed = await db().execute(sql`
    insert into ${demoUsage} (user_id, day, count)
    values (${userId}, current_date, 1)
    on conflict (user_id, day) do update
      set count = ${demoUsage}.count + 1
      where ${demoUsage}.count < ${limit}
    returning count
  `)

  const row = claimed.rows[0] as { count: number } | undefined
  if (row === undefined) return { allowed: false, remaining: 0, limit }
  return { allowed: true, remaining: Math.max(0, limit - Number(row.count)), limit }
}

/**
 * Pictures a user may keep in the operator's shared Cloudinary pool per day.
 * Each lives thirty minutes; this caps how many there can be. Someone who
 * connects their own Cloudinary account is not counted at all.
 */
export const TRIAL_IMAGES_PER_DAY = 5

/**
 * Claims one slot, or refuses. The same conditional upsert as the message
 * allowance, so two pictures requested at once cannot both take the last slot.
 */
export async function claimTrialImage(userId: string): Promise<DemoAllowance> {
  const limit = TRIAL_IMAGES_PER_DAY
  const claimed = await db().execute(sql`
    insert into ${demoUsage} (user_id, day, images)
    values (${userId}, current_date, 1)
    on conflict (user_id, day) do update
      set images = ${demoUsage}.images + 1
      where ${demoUsage}.images < ${limit}
    returning images
  `)
  const row = claimed.rows[0] as { images: number } | undefined
  if (row === undefined) return { allowed: false, remaining: 0, limit }
  return { allowed: true, remaining: Math.max(0, limit - Number(row.images)), limit }
}

export async function demoRemaining(userId: string): Promise<DemoAllowance> {
  const limit = runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY
  const rows = await db()
    .select({ count: demoUsage.count })
    .from(demoUsage)
    .where(and(eq(demoUsage.userId, userId), sql`${demoUsage.day} = current_date`))
    .limit(1)

  const used = rows[0]?.count ?? 0
  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit }
}
