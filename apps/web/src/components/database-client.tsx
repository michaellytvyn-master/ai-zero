'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Connects the user's own Postgres. The address is sent once, checked on the
 * server, encrypted, and never shown again — only where it points.
 */
export default function DatabaseClient(props: { where: string | null; trialMessages: number }) {
  const router = useRouter()
  const [where, setWhere] = useState(props.where)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moved, setMoved] = useState<number | null>(null)

  async function connect() {
    setBusy(true)
    setError(null)
    setMoved(null)
    const response = await fetch('/api/database', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: draft.trim() }),
    })
    const body = (await response.json().catch(() => null)) as {
      where?: string
      moved?: number
      error?: { message?: string }
    } | null
    setBusy(false)
    if (!response.ok) {
      setError(body?.error?.message ?? 'Could not connect to that database.')
      return
    }
    setWhere(body?.where ?? null)
    setMoved(body?.moved ?? 0)
    setDraft('')
    router.refresh()
  }

  async function disconnect() {
    setBusy(true)
    setError(null)
    await fetch('/api/database', { method: 'DELETE' })
    setBusy(false)
    setWhere(null)
    setMoved(null)
    router.refresh()
  }

  return (
    <div className="card">
      <div className="row">
        <strong>Postgres</strong>
        <span className="muted">postgres://user:password@host/database</span>
      </div>

      {where !== null ? (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="ok">Connected</span>
            <code>{where}</code>
            <button type="button" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </button>
          </div>
          {moved !== null && moved > 0 && (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              Moved your {moved} trial messages into it and removed them from ours.
            </p>
          )}
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            Disconnecting leaves everything in your database; only this service stops using it.
          </p>
        </>
      ) : (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="postgres://…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="button"
              className="primary"
              disabled={busy || draft.trim().length === 0}
              onClick={() => void connect()}
            >
              {busy ? 'Checking…' : 'Connect'}
            </button>
          </div>
          <p className="warn">
            Use a database made for this, not one that holds anything else: this service gets full
            access to whatever database you give it. Several hosts offer a free Postgres.
          </p>
        </>
      )}

      {error !== null && (
        <p className="error" style={{ margin: '10px 0 0' }}>
          {error}
        </p>
      )}
    </div>
  )
}
