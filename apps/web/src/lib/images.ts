import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { generatedImages } from '../db/schema'
import { deleteImage, operatorCloudinary } from './cloudinary'

/**
 * How long a picture survives in the operator's shared test pool: long enough
 * to look at and save, short enough not to fill the account. A picture in the
 * user's own account has no lifetime at all — and is not recorded here.
 */
export const IMAGE_LIFETIME_MS = 30 * 60 * 1000

export type ImageStorage = 'operator' | 'user'

/**
 * The user's own account keeps what it is given; only the shared pool expires.
 * Separate from the insert so the rule can be checked without a database.
 */
export function expiryFor(storage: ImageStorage, now = Date.now()): Date | null {
  return storage === 'user' ? null : new Date(now + IMAGE_LIFETIME_MS)
}

export interface StoredImageRow {
  readonly id: string
  readonly url: string
  readonly model: string
  /** Null when the picture is in the user's own account and is not swept. */
  readonly expiresAt: Date | null
}

export async function recordImage(input: {
  userId: string
  conversationId: string | null
  publicId: string
  url: string
  model: string
  bytes: number
  storage: ImageStorage
}): Promise<StoredImageRow> {
  // The user's own account keeps what it is given; only the shared pool expires.
  const expiresAt = input.storage === 'user' ? null : new Date(Date.now() + IMAGE_LIFETIME_MS)
  const rows = await db()
    .insert(generatedImages)
    .values({ ...input, expiresAt })
    .returning({
      id: generatedImages.id,
      url: generatedImages.url,
      model: generatedImages.model,
      expiresAt: generatedImages.expiresAt,
    })

  const created = rows[0]
  if (created === undefined) throw new Error('failed to record the image')
  return created
}

/**
 * Deletes from Cloudinary first and marks the row only on success, so a failed
 * call is retried on the next sweep instead of leaving an orphan nobody will
 * ever clean up.
 *
 * Only the operator's own pool is swept. A row in a user's account has a null
 * expiry and the `user` storage marker; both are checked, because deleting
 * someone else's picture with our credentials would fail anyway, and deleting
 * it successfully would be worse.
 */
export async function purgeExpiredImages(
  limit = 100,
): Promise<{ deleted: number; failed: number }> {
  const account = operatorCloudinary()
  if (account === null) return { deleted: 0, failed: 0 }

  const due = await db()
    .select({ id: generatedImages.id, publicId: generatedImages.publicId })
    .from(generatedImages)
    .where(
      and(
        isNull(generatedImages.deletedAt),
        eq(generatedImages.storage, 'operator'),
        lt(generatedImages.expiresAt, new Date()),
      ),
    )
    .limit(limit)

  let deleted = 0
  let failed = 0

  for (const row of due) {
    const gone = await deleteImage(row.publicId, account).catch(() => false)
    if (!gone) {
      failed += 1
      continue
    }
    await db()
      .update(generatedImages)
      .set({ deletedAt: new Date() })
      .where(eq(generatedImages.id, row.id))
    deleted += 1
  }

  return { deleted, failed }
}

export async function liveImagesFor(userId: string): Promise<StoredImageRow[]> {
  return db()
    .select({
      id: generatedImages.id,
      url: generatedImages.url,
      model: generatedImages.model,
      expiresAt: generatedImages.expiresAt,
    })
    .from(generatedImages)
    .where(
      and(
        eq(generatedImages.userId, userId),
        isNull(generatedImages.deletedAt),
        // A null expiry is a picture in the user's own account: it never goes.
        or(isNull(generatedImages.expiresAt), sql`${generatedImages.expiresAt} > now()`),
      ),
    )
}
