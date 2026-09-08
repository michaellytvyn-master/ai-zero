import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../db'
import { generatedImages } from '../db/schema'
import { deleteImage } from './cloudinary'

/** Long enough to look at and save, short enough not to fill the account. */
export const IMAGE_LIFETIME_MS = 60 * 60 * 1000

export interface StoredImageRow {
  readonly id: string
  readonly url: string
  readonly model: string
  readonly expiresAt: Date
}

export async function recordImage(input: {
  userId: string
  conversationId: string | null
  publicId: string
  url: string
  model: string
  bytes: number
}): Promise<StoredImageRow> {
  const expiresAt = new Date(Date.now() + IMAGE_LIFETIME_MS)
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
 */
export async function purgeExpiredImages(
  limit = 100,
): Promise<{ deleted: number; failed: number }> {
  const due = await db()
    .select({ id: generatedImages.id, publicId: generatedImages.publicId })
    .from(generatedImages)
    .where(and(isNull(generatedImages.deletedAt), lt(generatedImages.expiresAt, new Date())))
    .limit(limit)

  let deleted = 0
  let failed = 0

  for (const row of due) {
    const gone = await deleteImage(row.publicId).catch(() => false)
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
        sql`${generatedImages.expiresAt} > now()`,
      ),
    )
}
