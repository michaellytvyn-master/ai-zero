import { redirect } from 'next/navigation'
import { orderedProviders } from '@zca/providers'
import { safeAuth } from '@/auth'
import DatabaseClient from '@/components/database-client'
import KeysClient from '@/components/keys-client'
import { connectedDatabase } from '@/lib/connect-database'
import { TRIAL_HISTORY_MESSAGES } from '@/lib/content-store'
import { TRIAL_IMAGES_PER_DAY } from '@/lib/usage'
import { CLOUDINARY_KEY_ID } from '@/lib/image-store'
import { IMAGE_LIFETIME_MS } from '@/lib/images'
import { listProviderKeys } from '@/lib/provider-keys'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = await safeAuth()
  const userId = session?.user?.id
  if (typeof userId !== 'string') redirect('/signin')

  const keys = await listProviderKeys(userId)
  const stored = keys.map((key) => ({
    providerId: key.providerId,
    hint: key.hint,
    lastStatus: key.lastStatus,
  }))
  const minutes = Math.round(IMAGE_LIFETIME_MS / 60_000)
  const database = await connectedDatabase(userId)

  return (
    <>
      <h1>Provider keys</h1>
      <p className="muted">
        Add a key and your requests run on your own free tier instead of the shared pool, with no
        daily cap. Keys are encrypted before they are stored and are decrypted only while a request
        of yours is being served.
      </p>
      <h2 style={{ marginTop: 30 }}>Models</h2>
      <KeysClient
        providers={orderedProviders().map((provider) => ({
          id: provider.id,
          label: provider.label,
          signupUrl: provider.signupUrl,
          credentialHint: provider.credentialHint,
          ...(provider.privacyWarning !== undefined && {
            privacyWarning: provider.privacyWarning,
          }),
          free: provider.models.some((model) => model.free),
        }))}
        initialKeys={stored}
      />

      <h2 style={{ marginTop: 34 }}>Where your chat history is kept</h2>
      <p className="muted">
        Without a database of your own, we keep only your last {TRIAL_HISTORY_MESSAGES} messages —
        enough to try it. Connect your own Postgres and every conversation is written there instead,
        and kept for as long as you keep it. Ours then holds only your account, your encrypted keys,
        your daily allowance and usage counts — never the text of a conversation.
      </p>
      <DatabaseClient where={database} trialMessages={TRIAL_HISTORY_MESSAGES} />

      <h2 style={{ marginTop: 34 }}>Where generated pictures are kept</h2>
      <p className="muted">
        Without an account of your own, a generated picture goes to our shared test pool —
        {TRIAL_IMAGES_PER_DAY} a day, each deleted after {minutes} minutes. It is somewhere to try
        the feature, not somewhere to keep anything. Connect your own Cloudinary account and
        pictures are written there instead, on your own free tier, and are never deleted by us. They
        are yours, in your account, under your control.
      </p>
      <KeysClient
        providers={[
          {
            id: CLOUDINARY_KEY_ID,
            label: 'Cloudinary',
            signupUrl: 'https://cloudinary.com/users/register_free',
            credentialHint: 'cloud_name:api_key:api_secret',
            free: true,
            note:
              'All three values sit together on the Cloudinary dashboard. Removing them here ' +
              'leaves your pictures where they are — in your account, which only you can empty.',
          },
        ]}
        initialKeys={stored}
      />
    </>
  )
}
