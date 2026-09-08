import { eq } from 'drizzle-orm'
import type { CooldownStore } from '@zca/router-core'
import { db } from '../db'
import { providerCooldowns } from '../db/schema'

/** Replaces SPEC.md's Workers KV cooldowns now that the router runs on Vercel. */
export class PostgresCooldownStore implements CooldownStore {
  async isCoolingDown(providerId: string): Promise<boolean> {
    const rows = await db()
      .select({ until: providerCooldowns.until })
      .from(providerCooldowns)
      .where(eq(providerCooldowns.providerId, providerId))
      .limit(1)
    const row = rows[0]
    return row !== undefined && row.until.getTime() > Date.now()
  }

  async startCooldown(providerId: string, seconds: number): Promise<void> {
    const until = new Date(Date.now() + seconds * 1000)
    await db()
      .insert(providerCooldowns)
      .values({ providerId, until })
      .onConflictDoUpdate({ target: providerCooldowns.providerId, set: { until } })
  }
}
