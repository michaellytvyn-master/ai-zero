export default function LimitMeter(props: {
  label: string
  used: number
  limit: number | null
  window: string
  note: string
}) {
  const limit = props.limit
  const ratio = limit === null ? 0 : Math.min(1, props.used / Math.max(1, limit))
  const unlimited = limit === null
  const spent = ratio > 0.85

  return (
    <div className="meter">
      <div className="row">
        <strong>{props.label}</strong>
        <span className="muted small">{props.window}</span>
        <span className="spacer" style={{ marginLeft: 'auto' }} />
        <span className={spent ? 'value danger' : 'value'}>
          {limit === null ? props.used.toLocaleString() : `${props.used} / ${limit}`}
        </span>
      </div>
      {!unlimited && (
        <div className="track">
          <div
            className={spent ? 'fill hot' : 'fill'}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}
      <p className="muted small" style={{ margin: '6px 0 0' }}>
        {props.note}
      </p>
    </div>
  )
}
