import type { Savings } from '@zca/pricing'
import type { ChatMessage } from '@zca/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { streamChat, usesOwnKeys } from '@/lib/chat'
import { SITE_URL } from '@/lib/config'
import { contextCharBudget } from '@/lib/context-budget'
import { appendMessage, createConversation } from '@/lib/conversations'
import { pickableModels } from '@/lib/models'
import { type PageMode, asContextMessage, readPage } from '@/lib/page-context'
import { describeSite, requestPageAccess } from '@/lib/permissions'
import { loadSavings } from '@/lib/savings'
import { takePendingQuote } from '@/lib/tabs'
import { type Session, loadSession, signOut } from '@/lib/session'
import { applyEvent } from './apply-event'
import Composer from './Composer'
import Header from './Header'
import SavingsPanel from './SavingsPanel'
import SignIn from './SignIn'
import MessageList from './MessageList'
import { newTurn } from './turn'
import { useTabChat } from './use-tab-chat'

type Exhausted = { label: string; url: string }[]

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState<Exhausted | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savings, setSavings] = useState<Savings | null>(null)
  const [showSavings, setShowSavings] = useState(false)
  const [attached, setAttached] = useState<string | null>(null)
  const log = useRef<HTMLDivElement>(null)

  const signedIn = session ?? null
  const { tabId, tab, chat, turns, setTurns, patchChat, startNewChat } = useTabChat(signedIn)

  useEffect(() => {
    void loadSession().then(async (found) => {
      setSession(found)
      if (found !== null) setSavings(await loadSavings(found))
    })
  }, [])

  // The context menu stores the selection under this tab's own key.
  useEffect(() => {
    if (tabId === null) return
    void takePendingQuote(tabId).then((quote) => {
      if (quote !== null) patchChat({ draft: `"""\n${quote}\n"""\n\n` })
    })
  }, [patchChat, tabId])

  useEffect(() => {
    const panel = log.current
    if (panel === null || turns.length === 0) return
    panel.scrollTo({ top: panel.scrollHeight })
  }, [turns])

  const send = useCallback(async () => {
    const content = chat.draft.trim()
    if (content.length === 0 || busy || signedIn === null) return

    patchChat({ draft: '' })
    setBusy(true)
    setError(null)
    setExhausted(null)

    const history: ChatMessage[] = [...turns, { role: 'user' as const, content }].map((turn) => ({
      role: turn.role,
      content: turn.content,
    }))
    setTurns((previous) => [...previous, newTurn('user', content), newTurn('assistant', '')])

    if (chat.pageMode !== 'off' && tabId !== null) {
      try {
        const budget = contextCharBudget(pickableModels(signedIn), chat.model)
        const page = await readPage(tabId, chat.pageMode, budget)
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

    let conversationId = chat.conversationId
    if (conversationId === null) {
      conversationId = await createConversation(signedIn, content).catch(() => null)
      if (conversationId !== null) patchChat({ conversationId })
    }
    if (conversationId !== null) {
      await appendMessage(signedIn, conversationId, { role: 'user', content })
    }

    let answer = ''
    let answeredBy: { providerId: string; model: string } | null = null
    for await (const event of streamChat(
      signedIn,
      history,
      chat.model,
      chat.responseMode,
      new AbortController().signal,
    )) {
      if (event.kind === 'delta') answer += event.content
      if (event.kind === 'provider')
        answeredBy = { providerId: event.providerId, model: event.model }
      applyEvent(event, { setTurns, setProvider, setExhausted, setError })
    }

    if (conversationId !== null && answer.length > 0) {
      await appendMessage(signedIn, conversationId, {
        role: 'assistant',
        content: answer,
        ...(answeredBy ?? {}),
      })
    }

    setBusy(false)
    void loadSession().then(async (refreshed) => {
      if (refreshed === null) return
      setSession(refreshed)
      setSavings(await loadSavings(refreshed))
    })
  }, [busy, chat, patchChat, setTurns, signedIn, tabId, turns])

  if (session === undefined) return <div className="centered muted">Loading…</div>
  if (session === null) return <SignIn onSignedIn={setSession} />

  const ownKeys = usesOwnKeys(session)

  // Fired from the click itself, because Chrome only prompts inside a user
  // gesture. Already-granted sites resolve true with no prompt.
  const choosePageMode = (mode: PageMode) => {
    if (mode === 'off' || tab === null) {
      setError(null)
      patchChat({ pageMode: mode })
      return
    }
    void requestPageAccess(tab.url).then((granted) => {
      if (granted) {
        setError(null)
        patchChat({ pageMode: mode })
      } else {
        patchChat({ pageMode: 'off' })
        setError(
          `Without access to ${describeSite(tab.url)} the page cannot be read. Chrome asks once per site.`,
        )
      }
    })
  }

  return (
    <>
      <Header
        session={session}
        ownKeys={ownKeys}
        provider={provider}
        savings={savings}
        tabTitle={tab?.title ?? null}
        onNewChat={startNewChat}
        onToggleSavings={() => setShowSavings((open) => !open)}
        onSignOut={() => void signOut().then(() => setSession(null))}
      />

      <MessageList turns={turns} busy={busy} logRef={log} />

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

      {tabId === null && (
        <div className="notice">
          This panel is not attached to a tab yet, so it cannot read the page or keep a chat of its
          own. Reload the tab and open the panel again.
        </div>
      )}

      {error !== null && <div className="notice bad">{error}</div>}

      <Composer
        draft={chat.draft}
        onDraft={(draft) => patchChat({ draft })}
        onSend={() => void send()}
        busy={busy}
        pageMode={chat.pageMode}
        onPageMode={choosePageMode}
        models={pickableModels(session)}
        model={chat.model}
        onModel={(model) => patchChat({ model })}
        responseMode={chat.responseMode}
        onResponseMode={(responseMode) => patchChat({ responseMode })}
        showModelPicker={ownKeys}
        attached={attached}
      />
    </>
  )
}
