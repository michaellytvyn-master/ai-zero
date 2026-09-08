import { useCallback, useEffect, useRef, useState } from 'react'
import { formatUsd, type Savings } from '@zca/pricing'
import type { ChatMessage } from '@zca/shared'
import { streamChat, usesOwnKeys, type ChatEvent } from '@/lib/chat'
import { SITE_URL } from '@/lib/config'
import { asQuotedContext, readActivePage } from '@/lib/page-context'
import { pickableModels } from '@/lib/models'
import { loadSavings } from '@/lib/savings'
import { loadSession, signOut, startSignIn, type Session } from '@/lib/session'
import SavingsPanel from './SavingsPanel'

type Turn = { id: string; role: 'user' | 'assistant'; content: string; answeredBy?: string }
type Exhausted = { label: string; url: string }[]

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState<Exhausted | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savings, setSavings] = useState<Savings | null>(null)
  const [model, setModel] = useState('auto')
  const [showSavings, setShowSavings] = useState(false)
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadSession().then(async (found) => {
      setSession(found)
      if (found !== null) setSavings(await loadSavings(found))
    })
  }, [])

  // The context menu drops the selected text here before opening the panel.
  useEffect(() => {
    void chrome.storage.local.get('pendingQuote').then(async (stored) => {
      const quote = stored.pendingQuote as string | undefined
      if (quote === undefined || quote.length === 0) return
      await chrome.storage.local.remove('pendingQuote')
      setDraft(`"""\n${quote}\n"""\n\n`)
    })
  }, [])

  useEffect(() => {
    const panel = log.current
    if (panel === null || turns.length === 0) return
    panel.scrollTo({ top: panel.scrollHeight })
  }, [turns])

  const send = useCallback(async () => {
    const content = draft.trim()
    if (content.length === 0 || busy || session == null) return

    setDraft('')
    setBusy(true)
    setError(null)
    setExhausted(null)

    const history: ChatMessage[] = [...turns, { role: 'user' as const, content }]
    setTurns((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: 'user', content },
      { id: crypto.randomUUID(), role: 'assistant', content: '' },
    ])

    const controller = new AbortController()
    for await (const event of streamChat(session, history, model, controller.signal)) {
      applyEvent(event, { setTurns, setProvider, setExhausted, setError })
    }

    setBusy(false)
    void loadSession().then(async (refreshed) => {
      if (refreshed === null) return
      setSession(refreshed)
      setSavings(await loadSavings(refreshed))
    })
  }, [busy, draft, model, session, turns])

  async function addPageContext() {
    try {
      const page = await readActivePage()
      setDraft((previous) => `${asQuotedContext(page)}\n\n${previous}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not read the page')
    }
  }

  if (session === undefined) return <div className="centered muted">Loading…</div>

  if (session === null) {
    return (
      <div className="centered">
        <h3>Zero-Cost AI</h3>
        <p className="muted">Sign in with the account you use on the site.</p>
        <button
          type="button"
          className="primary"
          onClick={() => {
            void startSignIn()
              .then(setSession)
              .catch((cause: unknown) =>
                setError(cause instanceof Error ? cause.message : 'sign-in failed'),
              )
          }}
        >
          Sign in
        </button>
        {error !== null && <p className="muted">{error}</p>}
      </div>
    )
  }

  const ownKeys = usesOwnKeys(session)

  return (
    <>
      <header>
        <span className="badge">
          {ownKeys ? 'your keys' : `demo ${session.demo?.remaining ?? 0} left`}
        </span>
        {provider !== null && <span className="badge">via {provider}</span>}
        {session.stale && <span className="badge">offline</span>}
        {savings !== null && (
          <button
            type="button"
            className="badge"
            style={{ padding: '2px 7px', cursor: 'pointer' }}
            onClick={() => setShowSavings((open) => !open)}
          >
            saved {formatUsd(savings.microUsd)}
          </button>
        )}
        <span className="spacer" />
        <a href={`${SITE_URL}/dashboard/keys`} target="_blank" rel="noreferrer">
          Keys
        </a>
        <button
          type="button"
          className="linklike"
          onClick={() => {
            void signOut().then(() => setSession(null))
          }}
        >
          Sign out
        </button>
      </header>

      <div className="log" ref={log}>
        {turns.length === 0 && (
          <p className="muted">
            Ask anything. Select text on a page and right click to quote it, or pull the whole page
            in below.
          </p>
        )}
        {turns.map((turn, index) => (
          <div key={turn.id} className={`turn ${turn.role}`}>
            <div className="who">{turn.role}</div>
            {turn.content || (busy && index === turns.length - 1 ? '…' : '')}
          </div>
        ))}
      </div>

      {showSavings && savings !== null && <SavingsPanel savings={savings} />}

      {exhausted !== null && (
        <div className="notice">
          <strong>Today&apos;s free messages are used up.</strong>
          <p className="muted" style={{ margin: '6px 0' }}>
            Add a free key of your own and this cap stops applying.
          </p>
          {exhausted.map((item) => (
            <div key={item.url}>
              <a href={item.url} target="_blank" rel="noreferrer">
                Get a free {item.label} key
              </a>
            </div>
          ))}
          <a href={`${SITE_URL}/dashboard/keys`} target="_blank" rel="noreferrer">
            Then add it to your account
          </a>
        </div>
      )}

      {error !== null && <div className="notice bad">{error}</div>}

      <div className="composer">
        {ownKeys && (
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            aria-label="Model"
          >
            <option value="auto">Automatic (first available)</option>
            {pickableModels(session).map((option) => (
              <option key={option.id} value={option.id}>
                {option.providerLabel} · {option.label} · {Math.round(option.contextWindow / 1000)}k
              </option>
            ))}
          </select>
        )}
        <textarea
          rows={3}
          value={draft}
          placeholder="Ask something"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <div className="row">
          <button type="button" onClick={() => void addPageContext()}>
            Add page
          </button>
          <span className="spacer" style={{ marginLeft: 'auto' }} />
          <button type="button" className="primary" disabled={busy} onClick={() => void send()}>
            Send
          </button>
        </div>
      </div>
    </>
  )
}

function applyEvent(
  event: ChatEvent,
  setters: {
    setTurns: React.Dispatch<React.SetStateAction<Turn[]>>
    setProvider: (value: string) => void
    setExhausted: (value: Exhausted) => void
    setError: (value: string) => void
  },
): void {
  if (event.kind === 'provider') {
    setters.setProvider(event.providerId)
    setters.setTurns((previous) => {
      const last = previous[previous.length - 1]
      if (last === undefined) return previous
      return [
        ...previous.slice(0, -1),
        { ...last, answeredBy: `${event.providerId} · ${event.model}` },
      ]
    })
  } else if (event.kind === 'delta') {
    setters.setTurns((previous) => {
      const last = previous[previous.length - 1]
      if (last === undefined) return previous
      return [...previous.slice(0, -1), { ...last, content: last.content + event.content }]
    })
  } else if (event.kind === 'exhausted') {
    setters.setExhausted(event.signupUrls)
    setters.setTurns((previous) => previous.slice(0, -2))
  } else {
    setters.setError(event.message)
  }
}
