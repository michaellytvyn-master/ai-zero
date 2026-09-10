import { formatUsd, referenceModel, referenceModels, savingsFrom } from '@zca/pricing'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { safeAuth } from '@/auth'
import LimitMeter from '@/components/limit-meter'
import { runtimeConfig } from '@/config'
import { limitsFor } from '@/lib/limits'
import { listProviderKeys } from '@/lib/provider-keys'
import { usageTotalsForUser } from '@/lib/savings'
import { demoRemaining } from '@/lib/usage'

export const dynamic = 'force-dynamic'

export default async function LimitsPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>
}) {
  const session = await safeAuth()
  const userId = session?.user?.id
  if (typeof userId !== 'string') redirect('/signin')

  const { model: requested } = await searchParams
  const model = referenceModels.some((entry) => entry.id === requested)
    ? referenceModel(requested)
    : referenceModel()

  const keys = await listProviderKeys(userId)
  const trial = keys.length > 0 ? null : await demoRemaining(userId)
  const [limits, savings] = await Promise.all([
    limitsFor(userId, {
      trialRemaining: trial?.remaining ?? null,
      trialLimit: runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY,
    }),
    usageTotalsForUser(userId).then((totals) => savingsFrom(totals, model)),
  ])

  return (
    <>
      <h1>Limits and statistics</h1>
      <p className="muted">
        What this service allows you today. Your providers enforce their own allowances on their
        side, and those belong to your accounts rather than to us.
      </p>

      <div className="stack" style={{ gap: 10, marginBottom: 28 }}>
        {limits.map((limit) => (
          <LimitMeter key={limit.label} {...limit} />
        ))}
      </div>

      <h2>What you did not spend</h2>
      <div className="tiles" style={{ marginBottom: 14 }}>
        <div className="tile">
          <div className="value">{formatUsd(savings.microUsd)}</div>
          <div className="label">estimated cost avoided</div>
        </div>
        <div className="tile">
          <div className="value">{savings.requests.toLocaleString()}</div>
          <div className="label">requests answered</div>
        </div>
        <div className="tile">
          <div className="value">
            {(savings.inputTokens + savings.outputTokens).toLocaleString()}
          </div>
          <div className="label">tokens processed</div>
        </div>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 18 }}>
        {referenceModels.map((entry) => (
          <Link key={entry.id} href={`/settings/limits?model=${entry.id}`}>
            <button type="button" className={entry.id === model.id ? 'primary' : ''}>
              vs {entry.label}
            </button>
          </Link>
        ))}
      </div>

      <p className="muted small">
        {model.why} Priced at ${model.inputPerMillionUsd}/M input and ${model.outputPerMillionUsd}/M
        output, read from{' '}
        <a href={model.source} target="_blank" rel="noreferrer">
          {model.vendor}
        </a>{' '}
        on {model.checkedOn}. An estimate, not a bill.
      </p>

      <h2>By provider</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Requests</th>
              <th>Tokens in</th>
              <th>Tokens out</th>
              <th>Cost avoided</th>
            </tr>
          </thead>
          <tbody>
            {savings.byProvider.map((row) => (
              <tr key={row.providerId}>
                <td>{row.providerId}</td>
                <td>{row.requests.toLocaleString()}</td>
                <td>{row.inputTokens.toLocaleString()}</td>
                <td>{row.outputTokens.toLocaleString()}</td>
                <td>{formatUsd(row.microUsd)}</td>
              </tr>
            ))}
            {savings.byProvider.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Nothing yet. <Link href="/chat">Start a chat</Link> and this fills in.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
