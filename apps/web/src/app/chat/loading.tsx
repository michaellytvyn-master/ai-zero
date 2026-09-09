export default function Loading() {
  return (
    <main
      style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 'calc(100vh - 51px)' }}
      role="status"
      aria-busy="true"
      aria-label="Loading the conversation"
    >
      <div className="stack" style={{ padding: 14, gap: 6 }}>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="skeleton" style={{ height: 30 }} />
        ))}
      </div>
      <div className="stack" style={{ padding: 22, gap: 12 }}>
        <div className="skeleton" style={{ height: 60, width: '55%' }} />
        <div className="skeleton" style={{ height: 90, alignSelf: 'flex-end', width: '42%' }} />
        <div className="skeleton" style={{ height: 70, width: '68%' }} />
        <div className="spacer" />
        <div className="skeleton" style={{ height: 84, marginTop: 'auto' }} />
      </div>
    </main>
  )
}
