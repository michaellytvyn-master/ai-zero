import { and, eq } from 'drizzle-orm'
import { vaultConfig } from '../config'
import { db } from '../db'
import { providerKeys } from '../db/schema'
import { decryptSecret, encryptSecret, keyHint } from './crypto'

export interface ProviderKeySummary {
  readonly providerId: string
  readonly hint: string
  readonly createdAt: Date
  readonly lastUsedAt: Date | null
  readonly lastStatus: number | null
}

/** Never returns the secret. This is what the account panel renders. */
export async function listProviderKeys(userId: string): Promise<ProviderKeySummary[]> {
  const rows = await db()
    .select({
      providerId: providerKeys.providerId,
      hint: providerKeys.hint,
      createdAt: providerKeys.createdAt,
      lastUsedAt: providerKeys.lastUsedAt,
      lastStatus: providerKeys.lastStatus,
    })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId))
  return rows
}

export async function saveProviderKey(
  userId: string,
  providerId: string,
  plaintext: string,
): Promise<void> {
  const trimmed = plaintext.trim()
  if (trimmed.length === 0) throw new Error('empty key')

  const row = {
    userId,
    providerId,
    secret: encryptSecret(trimmed, vaultConfig().KEY_ENCRYPTION_KEY),
    hint: keyHint(trimmed),
  }

  await db()
    .insert(providerKeys)
    .values(row)
    .onConflictDoUpdate({
      target: [providerKeys.userId, providerKeys.providerId],
      set: { secret: row.secret, hint: row.hint, lastUsedAt: null, lastStatus: null },
    })
}

export async function deleteProviderKey(userId: string, providerId: string): Promise<void> {
  await db()
    .delete(providerKeys)
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.providerId, providerId)))
}

/**
 * Decrypts every key the user owns. The result lives in memory for the length
 * of one request and is never logged, cached or returned to the browser.
 */
export async function decryptedKeys(userId: string): Promise<ReadonlyMap<string, string>> {
  const rows = await db()
    .select({ providerId: providerKeys.providerId, secret: providerKeys.secret })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId))

  const encryptionKey = vaultConfig().KEY_ENCRYPTION_KEY
  const decrypted = new Map<string, string>()
  for (const row of rows) {
    try {
      decrypted.set(row.providerId, decryptSecret(row.secret, encryptionKey))
    } catch {
      // A row written under a rotated KEY_ENCRYPTION_KEY is unusable rather
      // than fatal: fall through to the demo pool and let the user re-add it.
    }
  }
  return decrypted
}

export async function markKeyUsed(
  userId: string,
  providerId: string,
  status: number,
): Promise<void> {
  await db()
    .update(providerKeys)
    .set({ lastUsedAt: new Date(), lastStatus: status })
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.providerId, providerId)))
}
