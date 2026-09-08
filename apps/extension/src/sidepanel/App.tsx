import { useCallback, useEffect, useRef, useState } from 'react'
import type { Savings } from '@zca/pricing'
import type { ChatMessage } from '@zca/shared'
import { streamChat, usesOwnKeys, type ChatEvent } from '@/lib/chat'
import { SITE_URL } from '@/lib/config'
import { contextCharBudget } from '@/lib/context-budget'
import { asContextMessage, readActivePage, type PageMode } from '@/lib/page-context'
import { pickableModels } from '@/lib/models'
import { loadSavings } from '@/lib/savings'
import { loadSession, signOut, type Session } from '@/lib/session'
import Composer from './Composer'
import Header from './Header'
import SignIn from './SignIn'
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
  const [pageMode, setPageMode] = useState<PageMode>('off')
  const [attached, setAttached] = useState<string | null>(null)
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

    const history: ChatMessage[] = [...turns, { role: 'user' as const, content }].map((turn) => ({
      role: turn.role,
      content: turn.content,
    }))
    setTurns((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: 'user', content },
      { id: crypto.randomUUID(), role: 'assistant', content: '' },
    ])

    if (pageMode !== 'off') {
      try {
        const budget = contextCharBudget(pickableModels(session), model)
        const page = await readActivePage(pageMode, budget)
        history.unshift({ role: 'system', content: asContextMessage(page) })
        setAttached(
          `${page.title || page.url} · ${page.mode} · ${page.content.length.toLocaleString()} chars${
            page.truncated ? ' (truncated)' : ''
          }`,
        )
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not read the page.')
        setTurns((previous) => previous.slice(0, -2))
        setBusy(false)
        return
      }
    } else {
      setAttached(null)
    }

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
  }, [busy, draft, model, pageMode, session, turns])

  if (session === undefined) return <div className="centered muted">Loading…</div>

  if (session === null) return <SignIn onSignedIn={setSession} />

  const ownKeys = usesOwnKeys(session)

  return (
    <>
      <Header
        session={session}
        ownKeys={ownKeys}
        provider={provider}
        savings={savings}
        onToggleSavings={() => setShowSavings((open) => !open)}
        onSignOut={() => void signOut().then(() => setSession(null))}
      />

      <div className="log" ref={log}>
        {turns.length === 0 && (
          <p className="muted">
            Ask anything. To ask about the page you are on, switch &ldquo;Do not read the
            page&rdquo; below to text or HTML. Selecting text and right clicking quotes just that.
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

      <Composer
        draft={draft}
        onDraft={setDraft}
        onSend={() => void send()}
        busy={busy}
        pageMode={pageMode}
        onPageMode={setPageMode}
        models={pickableModels(session)}
        model={model}
        onModel={setModel}
        showModelPicker={ownKeys}
        attached={attached}
      />
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
