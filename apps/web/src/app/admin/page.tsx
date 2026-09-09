import { formatUsd, referenceModel, savingsFrom } from '@zca/pricing'
import { redirect } from 'next/navigation'
import { signOutAdmin } from './actions'
import { isAdminSignedIn } from '@/lib/admin-auth'
import { dailyRows, providerRows, userRows } from '@/lib/admin'
import { usageTotalsForEveryone } from '@/lib/savings'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Operator', robots: { index: false, follow: false } }

export default async function AdminPage() {
  if (!(await isAdminSignedIn())) redirect('/admin/login')

  const [people, providers, days, totals] = await Promise.all([
    userRows(),
    providerRows(),
    dailyRows(),
    usageTotalsForEveryone(),
  ])
  const model = referenceModel()
  const savings = savingsFrom(totals, model)
  const active = people.filter((person) => person.requests > 0).length

  return (
    <main className="wrap" style={{ maxWidth: 1080 }}>
      <div className="row">
        <h1 style={{ margin: 0 }}>Operator</h1>
        <span className="spacer" style={{ marginLeft: 'auto' }} />
        <form action={signOutAdmin}>
          <button type="submit">Sign out</button>
        </form>
      </div>
      <p className="muted">
        Metadata only. Conversation content is never shown here and no query on this page can reach
        it.
      </p>

      <div className="tiles" style={{ margin: '20px 0 28px' }}>
        <div className="tile">
          <div className="value">{people.length.toLocaleString()}</div>
          <div className="label">accounts</div>
        </div>
        <div className="tile">
          <div className="value">{active.toLocaleString()}</div>
          <div className="label">have sent something</div>
        </div>
        <div className="tile">
          <div className="value">{savings.requests.toLocaleString()}</div>
          <div className="label">requests answered</div>
        </div>
        <div className="tile">
          <div className="value">{formatUsd(savings.microUsd)}</div>
          <div className="label">would have cost on {model.label}</div>
        </div>
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
              <td className="muted">{row.keyOwner === 'user' ? "user's own" : 'trial pool'}</td>
              <td>{row.requests.toLocaleString()}</td>
              <td>{row.totalTokens.toLocaleString()}</td>
              <td>{row.avgLatencyMs} ms</td>
              <td className={row.failures > 0 ? 'danger' : undefined}>{row.failures}</td>
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

      <h2>Accounts</h2>
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
              <td>{row.requests.toLocaleString()}</td>
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
              <td>{row.requests.toLocaleString()}</td>
              <td>{row.totalTokens.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
