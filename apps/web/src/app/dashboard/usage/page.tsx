import Link from 'next/link'
import { redirect } from 'next/navigation'
import { formatUsd, referenceModel, referenceModels, savingsFrom } from '@zca/pricing'
import { safeAuth } from '@/auth'
import { usageTotalsForUser } from '@/lib/savings'

export const dynamic = 'force-dynamic'

export default async function SavingsPage({
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

  const savings = savingsFrom(await usageTotalsForUser(userId), model)

  return (
    <>
      <h1>What this would have cost</h1>

      <div className="card">
        <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>
          {formatUsd(savings.microUsd)}
        </div>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Estimated cost if the same {savings.inputTokens.toLocaleString()} input and{' '}
          {savings.outputTokens.toLocaleString()} output tokens had run on {model.label}, across{' '}
          {savings.requests.toLocaleString()} requests. This is an estimate, not a bill, and not
          money you earned.
        </p>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 18 }}>
        {referenceModels.map((entry) => (
          <Link key={entry.id} href={`/dashboard/usage?model=${entry.id}`}>
            <button type="button" className={entry.id === model.id ? 'primary' : ''}>
              vs {entry.label}
            </button>
          </Link>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        {model.why} Priced at ${model.inputPerMillionUsd}/M input and ${model.outputPerMillionUsd}/M
        output, read from{' '}
        <a href={model.source} target="_blank" rel="noreferrer">
          {model.vendor}
        </a>{' '}
        on {model.checkedOn}.
      </p>

      <h2>By provider</h2>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Requests</th>
            <th>Tokens in</th>
            <th>Tokens out</th>
            <th>Estimated cost avoided</th>
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

      <p className="muted" style={{ fontSize: 13 }}>
        Failed requests are left out: they produced no tokens, so counting them would inflate the
        number without measuring anything.
      </p>
    </>
  )
}
