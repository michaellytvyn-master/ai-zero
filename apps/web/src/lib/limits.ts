import { and, eq, sql } from 'drizzle-orm'
import { orderedProviders } from '@zca/providers'
import { db } from '../db'
import { usageEvents } from '../db/schema'
import { requestsPerMinute } from './rate-limit'

export interface LimitRow {
  readonly label: string
  readonly used: number
  readonly limit: number | null
  readonly window: string
  readonly note: string
}

/**
 * What is left today, from this service's own ceilings. Provider allowances are
 * deliberately absent: they belong to the user's account, are enforced there,
 * and are not something this service can read or should guess at.
 */
export async function limitsFor(
  userId: string,
  options: { trialRemaining: number | null; trialLimit: number },
): Promise<LimitRow[]> {
  const rows = await db()
    .select({
      today: sql<number>`count(*) filter (where ${usageEvents.at} >= date_trunc('day', now()))::int`,
      thisMinute: sql<number>`count(*) filter (where ${usageEvents.at} >= now() - interval '1 minute')::int`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId)))

  const today = rows[0]?.today ?? 0
  const thisMinute = rows[0]?.thisMinute ?? 0

  const limits: LimitRow[] = [
    {
      label: 'Requests',
      used: thisMinute,
      limit: requestsPerMinute(),
      window: 'this minute',
      note: 'Applies to every account, so one runaway client cannot make this server look abusive.',
    },
  ]

  if (options.trialRemaining !== null) {
    limits.push({
      label: 'Trial messages',
      used: options.trialLimit - options.trialRemaining,
      limit: options.trialLimit,
      window: 'today',
      note: 'Runs on the operator keys. Connect your own and this stops applying.',
    })
  } else {
    limits.push({
      label: 'Trial messages',
      used: 0,
      limit: null,
      window: 'today',
      note: `Not applicable — you are on your own keys, so your allowance is whatever ${orderedProviders()
        .map((provider) => provider.label)
        .join(' and ')} give you.`,
    })
  }

  limits.push({
    label: 'Requests answered',
    used: today,
    limit: null,
    window: 'today',
    note: 'Everything this account sent today, across every surface.',
  })

  return limits
}
