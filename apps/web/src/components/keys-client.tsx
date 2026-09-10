'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface ProviderOption {
  id: string
  label: string
  signupUrl: string
  credentialHint: string
  free: boolean
  /** Set only where this provider's free tier treats conversations differently. */
  privacyWarning?: string
  /** Shown under the field: what connecting this actually changes. */
  note?: string
}

interface StoredKey {
  providerId: string
  hint: string
  lastStatus: number | null
}

export default function KeysClient(props: {
  providers: ProviderOption[]
  initialKeys: StoredKey[]
}) {
  const router = useRouter()
  const [keys, setKeys] = useState(props.initialKeys)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(providerId: string, method: 'POST' | 'DELETE') {
    setBusy(providerId)
    setError(null)

    const response = await fetch('/api/keys', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        method === 'POST' ? { providerId, key: drafts[providerId] ?? '' } : { providerId },
      ),
    })
    const body = (await response.json().catch(() => null)) as {
      keys?: StoredKey[]
      error?: { message?: string }
    } | null

    if (!response.ok) setError(body?.error?.message ?? 'Could not save that key.')
    else {
      setKeys(body?.keys ?? [])
      setDrafts((previous) => ({ ...previous, [providerId]: '' }))
    }

    setBusy(null)
    router.refresh()
  }

  return (
    <>
      {error !== null && (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {props.providers.map((provider) => {
        const stored = keys.find((key) => key.providerId === provider.id)
        return (
          <div key={provider.id} className="card">
            <div className="row">
              <strong>{provider.label}</strong>
              <span className="muted">{provider.credentialHint}</span>
              <span className="spacer" style={{ marginLeft: 'auto' }} />
              <a href={provider.signupUrl} target="_blank" rel="noreferrer">
                Get a key
              </a>
            </div>

            {provider.privacyWarning !== undefined && (
              <p className="warn">{provider.privacyWarning}</p>
            )}
            {provider.note !== undefined && (
              <p className="muted small" style={{ margin: '8px 0 0' }}>
                {provider.note}
              </p>
            )}

            {stored !== undefined ? (
              <div className="row" style={{ marginTop: 10 }}>
                <code>••••{stored.hint}</code>
                {stored.lastStatus !== null && stored.lastStatus >= 400 && (
                  <span style={{ color: 'var(--danger)' }}>
                    last call failed with {stored.lastStatus}
                  </span>
                )}
                <button
                  type="button"
                  disabled={busy === provider.id}
                  onClick={() => void submit(provider.id, 'DELETE')}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="row" style={{ marginTop: 10 }}>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={`${provider.label}: ${provider.credentialHint}`}
                  value={drafts[provider.id] ?? ''}
                  onChange={(event) =>
                    setDrafts((previous) => ({ ...previous, [provider.id]: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="primary"
                  disabled={busy === provider.id || (drafts[provider.id] ?? '').length === 0}
                  onClick={() => void submit(provider.id, 'POST')}
                >
                  Save
                </button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
