import {
  type CloudinaryCredential,
  operatorCloudinary,
  parseCloudinaryCredential,
} from './cloudinary'
import type { ImageStorage } from './images'
import { decryptedKeys } from './provider-keys'

/**
 * The id a user's Cloudinary credential is stored under in the same encrypted
 * vault as the model keys. It is not an LLM provider, which is why
 * `llmProviderIds` exists: adding a place to keep pictures must not quietly
 * move someone off the shared model pool.
 */
export const CLOUDINARY_KEY_ID = 'cloudinary'

export interface ImageDestination {
  readonly account: CloudinaryCredential
  readonly storage: ImageStorage
}

/**
 * Where this user's pictures go. Their own account if they connected one — kept
 * for as long as they keep it, on their own free tier — and otherwise the
 * operator's shared pool, which is a place to try the feature, not to keep
 * anything: it is swept every hour.
 */
export async function imageDestination(userId: string): Promise<ImageDestination | null> {
  const own = (await decryptedKeys(userId)).get(CLOUDINARY_KEY_ID)
  if (own !== undefined) {
    try {
      return { account: parseCloudinaryCredential(own), storage: 'user' }
    } catch {
      // A credential stored before a format change, or under a rotated
      // encryption key. Falling back beats failing the request outright.
    }
  }

  const operator = operatorCloudinary()
  return operator === null ? null : { account: operator, storage: 'operator' }
}
