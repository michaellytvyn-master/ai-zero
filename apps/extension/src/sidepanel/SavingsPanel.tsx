import { formatUsd, type Savings } from '@zca/pricing'
import { SITE_URL } from '@/lib/config'

export default function SavingsPanel({ savings }: { savings: Savings }) {
  return (
    <div className="notice">
      <div style={{ fontSize: 22, fontWeight: 600 }}>{formatUsd(savings.microUsd)}</div>
      <p className="muted" style={{ margin: '4px 0 8px', fontSize: 12 }}>
        Estimated cost if the same tokens had run on {savings.modelLabel}, across{' '}
        {savings.requests.toLocaleString()} requests. An estimate, not money earned.
      </p>
      {savings.byProvider.map((row) => (
        <div key={row.providerId} className="row" style={{ fontSize: 12 }}>
          <span>{row.providerId}</span>
          <span className="spacer" style={{ marginLeft: 'auto' }} />
          <span className="muted">
            {row.requests} req · {formatUsd(row.microUsd)}
          </span>
        </div>
      ))}
      <a
        href={`${SITE_URL}/settings/limits`}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: 12 }}
      >
        Full breakdown
      </a>
    </div>
  )
}
