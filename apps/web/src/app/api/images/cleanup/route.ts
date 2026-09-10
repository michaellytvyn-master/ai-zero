import { purgeExpiredImages } from '@/lib/images'
import { purgeOldLoginAttempts } from '@/lib/admin-auth'
import { purgeOldRequestWindows } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Run on two schedules: every 15 minutes from .github/workflows/sweep.yml, and
 * once a day from vercel.json as a backstop — Vercel's free plan allows no more
 * than daily. Guarded by CRON_SECRET so it cannot be used by anyone else to
 * hammer the storage API.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (secret === undefined || secret.length === 0) {
    return Response.json({ error: { type: 'unconfigured' } }, { status: 501 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: { type: 'forbidden' } }, { status: 403 })
  }

  const [images, windows, attempts] = await Promise.all([
    purgeExpiredImages(),
    purgeOldRequestWindows(),
    purgeOldLoginAttempts(),
  ])
  return Response.json({ images, staleRateWindows: windows, staleLoginAttempts: attempts })
}
