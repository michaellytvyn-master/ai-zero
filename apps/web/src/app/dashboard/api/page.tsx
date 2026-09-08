import { qualifiedModelIds } from '@zca/providers'
import { redirect } from 'next/navigation'
import { safeAuth } from '@/auth'
import ApiKeysClient from '@/components/api-keys-client'
import { listApiKeys } from '@/lib/api-keys'

export const dynamic = 'force-dynamic'

export default async function ApiPage() {
  const session = await safeAuth()
  const userId = session?.user?.id
  if (typeof userId !== 'string') redirect('/signin')

  const keys = await listApiKeys(userId)

  return (
    <>
      <h1>API</h1>
      <p className="muted">
        Call this service from your own code with an OpenAI-compatible request. Requests run on the
        provider keys you have added, so your quota, your models — this is only the router in front
        of them.
      </p>

      <ApiKeysClient
        initialKeys={keys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          createdAt: key.createdAt.toISOString(),
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        }))}
      />

      <h2 style={{ marginTop: 32 }}>Using it</h2>
      <p className="muted">
        The endpoint speaks the OpenAI chat completions format, so any client that takes a base URL
        works: point it here and pass your key as the bearer token.
      </p>
      <pre className="code">{`curl https://your-domain/api/v1/chat/completions \\
  -H "Authorization: Bearer zca_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "stream": true,
    "messages": [{"role": "user", "content": "hello"}]
  }'`}</pre>

      <h3>Models</h3>
      <p className="muted">
        Pass <code>auto</code> to let failover choose, or name one. Ask{' '}
        <code>GET /api/v1/models</code> for this list at runtime.
      </p>
      <ul className="muted">
        {qualifiedModelIds().map((id) => (
          <li key={id}>
            <code>{id}</code>
          </li>
        ))}
      </ul>

      <h3>What to expect</h3>
      <ul className="muted">
        <li>
          A non-standard <code>provider</code> event opens the stream, naming who answered. The rest
          is OpenAI-compatible, so a normal client ignores it.
        </li>
        <li>
          Without your own provider keys, requests come from the shared pool and are capped per day
          like the site.
        </li>
        <li>
          A key is shown once, when you create it. Only its hash is stored, so it cannot be
          recovered — make a new one instead.
        </li>
        <li>An API key cannot create or revoke other keys. That needs signing in here.</li>
      </ul>
    </>
  )
}
