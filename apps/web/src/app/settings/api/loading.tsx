export default function Loading() {
  return (
    <div
      className="stack"
      style={{ padding: 30, gap: 12 }}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="skeleton" style={{ height: 28, width: '38%' }} />
      <div className="skeleton" style={{ height: 15, width: '62%' }} />
      <div className="tiles" style={{ marginTop: 14 }}>
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="skeleton" style={{ height: 84 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 200, marginTop: 10 }} />
    </div>
  )
}
