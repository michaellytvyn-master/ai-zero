import { notFound, redirect } from 'next/navigation'
import { safeAuth } from '@/auth'
import { isAdmin } from '@/config'
import { formatUsd, referenceModel, savingsFrom } from '@zca/pricing'
import { dailyRows, providerRows, userRows } from '@/lib/admin'
import { usageTotalsForEveryone } from '@/lib/savings'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await safeAuth()
  const email = session?.user?.email
  if (typeof email !== 'string') redirect('/signin')
  // 404 rather than 403: a non-admin should not learn the page exists.
  if (!isAdmin(email)) notFound()

  const [people, providers, days, totals] = await Promise.all([
    userRows(),
    providerRows(),
    dailyRows(),
    usageTotalsForEveryone(),
  ])
  const model = referenceModel()
  const savings = savingsFrom(totals, model)

  return (
    <main className="wrap" style={{ maxWidth: 1100 }}>
      <h1>Usage</h1>
      <p className="muted">
        Metadata only. Conversation content is never shown here and is not queryable from this page.
      </p>

      <div className="card">
        <div style={{ fontSize: 28, fontWeight: 600 }}>{formatUsd(savings.microUsd)}</div>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Estimated cost of all {savings.requests.toLocaleString()} answered requests if they had
          run on {model.label} instead. An estimate, not a bill.
        </p>
      </div>

      <h2>Providers</h2>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Key</th>
            <th>Requests</th>
            <th>Tokens</th>
            <th>Avg latency</th>
            <th>Failures</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((row) => (
            <tr key={`${row.providerId}-${row.keyOwner}`}>
              <td>{row.providerId}</td>
              <td className="muted">{row.keyOwner === 'user' ? "user's own" : 'demo pool'}</td>
              <td>{row.requests}</td>
              <td>{row.totalTokens.toLocaleString()}</td>
              <td>{row.avgLatencyMs} ms</td>
              <td style={row.failures > 0 ? { color: 'var(--danger)' } : undefined}>
                {row.failures}
              </td>
            </tr>
          ))}
          {providers.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No requests recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Users</h2>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Joined</th>
            <th>Requests</th>
            <th>Tokens in</th>
            <th>Tokens out</th>
            <th>Last active</th>
          </tr>
        </thead>
        <tbody>
          {people.map((row) => (
            <tr key={row.id}>
              <td>{row.email}</td>
              <td className="muted">{row.createdAt.toISOString().slice(0, 10)}</td>
              <td>{row.requests}</td>
              <td>{row.inputTokens.toLocaleString()}</td>
              <td>{row.outputTokens.toLocaleString()}</td>
              <td className="muted">
                {row.lastActive === null
                  ? '—'
                  : new Date(row.lastActive).toISOString().slice(0, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Last 30 days</h2>
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Requests</th>
            <th>Tokens</th>
          </tr>
        </thead>
        <tbody>
          {days.map((row) => (
            <tr key={row.day}>
              <td>{row.day}</td>
              <td>{row.requests}</td>
              <td>{row.totalTokens.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
