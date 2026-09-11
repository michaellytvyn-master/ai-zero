import Link from 'next/link'
import { redirect } from 'next/navigation'
import { orderedProviders } from '@zca/providers'
import { formatUsd, referenceModel, savingsFrom } from '@zca/pricing'
import { safeAuth } from '@/auth'
import { contentStoreFor } from '@/lib/content-store'
import type { ConversationPage } from '@/lib/conversations'
import { UserDatabaseError } from '@/lib/user-database'
import { listProviderKeys, ownsModelKey } from '@/lib/provider-keys'
import { usageTotalsForUser } from '@/lib/savings'
import { demoRemaining } from '@/lib/usage'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await safeAuth()
  const userId = session?.user?.id
  if (typeof userId !== 'string') redirect('/signin')

  const [keys, totals] = await Promise.all([listProviderKeys(userId), usageTotalsForUser(userId)])
  let conversations: ConversationPage = { items: [], nextCursor: null }
  let historyError: string | null = null
  try {
    conversations = await (await contentStoreFor(userId)).list()
  } catch (error) {
    if (!(error instanceof UserDatabaseError)) throw error
    historyError = error.userMessage
  }
  const savings = savingsFrom(totals, referenceModel())
  const allowance = ownsModelKey(keys.map((key) => key.providerId))
    ? null
    : await demoRemaining(userId)
  const connected = new Set(keys.map((key) => key.providerId))

  return (
    <>
      <h1>Overview</h1>

      <div className="tiles" style={{ marginBottom: 26 }}>
        <div className="tile">
          <div className="value">{savings.requests.toLocaleString()}</div>
          <div className="label">requests answered</div>
        </div>
        <div className="tile">
          <div className="value">{formatUsd(savings.microUsd)}</div>
          <div className="label">estimated cost avoided</div>
        </div>
        <div className="tile">
          <div className="value">
            {(savings.inputTokens + savings.outputTokens).toLocaleString()}
          </div>
          <div className="label">tokens processed</div>
        </div>
        <div className="tile">
          <div className="value">
            {allowance === null ? 'unlimited' : `${allowance.remaining}/${allowance.limit}`}
          </div>
          <div className="label">
            {allowance === null ? 'running on your own keys' : 'free messages left today'}
          </div>
        </div>
      </div>

      <h2>Connections</h2>
      <p className="muted">
        Connect a provider and your requests run on your own free tier, with no daily cap.
      </p>
      <div className="tiles" style={{ marginBottom: 12 }}>
        {orderedProviders().map((provider) => (
          <div key={provider.id} className="tile">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{provider.label}</strong>
              <span className="pill" style={{ margin: 0 }}>
                {connected.has(provider.id) ? 'connected' : 'not connected'}
              </span>
            </div>
            <div className="label" style={{ marginTop: 6 }}>
              {provider.models.length} free models
            </div>
          </div>
        ))}
      </div>
      <Link href="/settings/keys">
        <button type="button">Manage provider keys</button>
      </Link>

      <h2 style={{ marginTop: 30 }}>Recent chats</h2>
      {historyError !== null ? (
        <p className="error">{historyError}</p>
      ) : conversations.items.length === 0 ? (
        <p className="muted">
          Nothing yet. <Link href="/chat">Start a conversation</Link>.
        </p>
      ) : (
        <div className="tablewrap">
          <table>
            <tbody>
              {conversations.items.slice(0, 8).map((conversation) => (
                <tr key={conversation.id}>
                  <td>
                    <Link href={`/chat?c=${conversation.id}`}>{conversation.title}</Link>
                  </td>
                  <td className="muted" style={{ width: 140, textAlign: 'right' }}>
                    {conversation.updatedAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
