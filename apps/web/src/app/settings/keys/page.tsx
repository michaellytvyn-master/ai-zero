import { redirect } from 'next/navigation'
import { orderedProviders } from '@zca/providers'
import { safeAuth } from '@/auth'
import KeysClient from '@/components/keys-client'
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

      <h2 style={{ marginTop: 34 }}>Where generated pictures are kept</h2>
      <p className="muted">
        Without an account of your own, a generated picture goes to our shared test pool and is
        deleted after {minutes} minutes — it is somewhere to try the feature, not somewhere to keep
        anything. Connect your own Cloudinary account and pictures are written there instead, on
        your own free tier, and are never deleted by us. They are yours, in your account, under your
        control.
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
