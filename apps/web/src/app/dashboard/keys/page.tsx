import { redirect } from 'next/navigation'
import { orderedProviders } from '@zca/providers'
import { safeAuth } from '@/auth'
import KeysClient from '@/components/keys-client'
import { listProviderKeys } from '@/lib/provider-keys'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = await safeAuth()
  const userId = session?.user?.id
  if (typeof userId !== 'string') redirect('/signin')

  const keys = await listProviderKeys(userId)

  return (
    <>
      <h1>Provider keys</h1>
      <p className="muted">
        Add a key and your requests run on your own free tier instead of the shared pool, with no
        daily cap. Keys are encrypted before they are stored and are decrypted only while a request
        of yours is being served.
      </p>
      <KeysClient
        providers={orderedProviders().map((provider) => ({
          id: provider.id,
          label: provider.label,
          signupUrl: provider.signupUrl,
          credentialHint: provider.credentialHint,
          free: provider.models.some((model) => model.free),
        }))}
        initialKeys={keys.map((key) => ({
          providerId: key.providerId,
          hint: key.hint,
          lastStatus: key.lastStatus,
        }))}
      />
    </>
  )
}
