import { sql } from 'drizzle-orm'
import { db } from '../db'
import { requestWindows } from '../db/schema'

export interface Allowance {
  readonly allowed: boolean
  readonly limit: number
  readonly remaining: number
  /** Seconds until the window rolls over, for a Retry-After header. */
  readonly retryAfter: number
}

export function requestsPerMinute(): number {
  const configured = Number(process.env.REQUESTS_PER_MINUTE_PER_USER)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 60
}

/**
 * Claims one request for this minute. The conditional upsert is atomic, so
 * concurrent requests cannot both take the last slot — a read-then-write check
 * would let them, which is exactly the case this exists to stop.
 */
export async function claimRequestSlot(
  userId: string,
  limit = requestsPerMinute(),
): Promise<Allowance> {
  const claimed = await db().execute(sql`
    insert into ${requestWindows} (user_id, minute, count)
    values (${userId}, date_trunc('minute', now()), 1)
    on conflict (user_id, minute) do update
      set count = ${requestWindows}.count + 1
      where ${requestWindows}.count < ${limit}
    returning count
  `)

  const row = claimed.rows[0] as { count: number } | undefined
  const retryAfter = 60 - new Date().getSeconds()

  if (row === undefined) return { allowed: false, limit, remaining: 0, retryAfter }
  return { allowed: true, limit, remaining: Math.max(0, limit - Number(row.count)), retryAfter }
}

/** Rows older than a few minutes are dead weight; swept with the images. */
export async function purgeOldRequestWindows(): Promise<number> {
  const result = await db().execute(
    sql`delete from ${requestWindows} where minute < now() - interval '10 minutes'`,
  )
  return result.rowCount ?? 0
}

export function tooManyRequests(allowance: Allowance): Response {
  return Response.json(
    {
      error: {
        type: 'rate_limited',
        message: `Up to ${allowance.limit} requests a minute. Try again shortly.`,
      },
    },
    { status: 429, headers: { 'retry-after': String(allowance.retryAfter) } },
  )
}
