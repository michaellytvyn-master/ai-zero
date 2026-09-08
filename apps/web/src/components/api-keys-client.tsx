'use client'

import { TRASH } from '@zca/shared'
import { useState } from 'react'
import Icon from './icon'

interface KeyRow {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
}

export default function ApiKeysClient({ initialKeys }: { initialKeys: KeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys)
  const [name, setName] = useState('')
  const [issued, setIssued] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    const response = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (response.ok) {
      const body = (await response.json()) as { key: { secret: string }; keys: KeyRow[] }
      setIssued(body.key.secret)
      setKeys(body.keys)
      setName('')
    }
    setBusy(false)
  }

  async function revoke(id: string) {
    const response = await fetch('/api/api-keys', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (response.ok) setKeys(((await response.json()) as { keys: KeyRow[] }).keys)
  }

  return (
    <>
      {issued !== null && (
        <div className="card">
          <strong>Copy this now.</strong>
          <p className="muted" style={{ margin: '4px 0 8px' }}>
            Only a hash is stored, so this is the one time it can be shown.
          </p>
          <pre className="code">{issued}</pre>
          <button type="button" onClick={() => setIssued(null)}>
            I have saved it
          </button>
        </div>
      )}

      <div className="row" style={{ margin: '14px 0' }}>
        <input
          value={name}
          placeholder="What is this key for?"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="button" className="primary" disabled={busy} onClick={() => void create()}>
          Create key
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="muted">No keys yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Created</th>
              <th>Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>
                  <code>{key.prefix}…</code>
                </td>
                <td className="muted">{key.createdAt.slice(0, 10)}</td>
                <td className="muted">{key.lastUsedAt?.slice(0, 10) ?? 'never'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="icon"
                    title="Revoke"
                    onClick={() => void revoke(key.id)}
                  >
                    <Icon shape={TRASH} size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
