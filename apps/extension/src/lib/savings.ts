import type { Savings } from '@zca/pricing'
import { SITE_URL } from './config'
import { readLocal, writeLocal } from './storage'
import type { Session } from './session'

const KEY = 'savings'

/**
 * Totals live on the server now that usage is recorded per account, so this is
 * a fetch with a cached fallback: the panel should still show the last known
 * figure while offline rather than flashing a zero that looks like a reset.
 */
export async function loadSavings(session: Session): Promise<Savings | null> {
  try {
    const response = await fetch(`${SITE_URL}/api/savings`, {
      headers: { authorization: `Bearer ${session.token}` },
    })
    if (!response.ok) return readLocal<Savings>(KEY)

    const savings = (await response.json()) as Savings
    await writeLocal(KEY, savings)
    return savings
  } catch {
    return readLocal<Savings>(KEY)
  }
}
