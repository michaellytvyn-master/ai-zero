import type { Savings } from '@zca/pricing'
import { useEffect, useRef, useState } from 'react'
import { usesOwnKeys } from '@/lib/chat'
import { pickableModels } from '@/lib/models'
import type { PageMode } from '@/lib/page-context'
import { isReadable, requestPageAccess } from '@/lib/permissions'
import { loadSavings } from '@/lib/savings'
import { type Session, loadSession, signOut } from '@/lib/session'
import { takePendingQuote } from '@/lib/tabs'
import Composer from './Composer'
import ExhaustedNotice from './ExhaustedNotice'
import Header from './Header'
import MessageList from './MessageList'
import SavingsPanel from './SavingsPanel'
import SignIn from './SignIn'
import { useSend } from './use-send'
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

  const send = useSend({
    session: signedIn,
    tabId,
    chat,
    turns,
    busy,
    setTurns,
    patchChat,
    setBusy,
    setError,
    setExhausted,
    setProvider,
    setAttached,
    onRefreshed: (refreshed, freshSavings) => {
      setSession(refreshed)
      setSavings(freshSavings)
    },
  })

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
    if (!isReadable(tab.url)) {
      setError('Browser pages cannot be read by extensions.')
      return
    }

    void requestPageAccess().then((granted) => {
      if (granted) {
        setError(null)
        patchChat({ pageMode: mode })
      } else {
        patchChat({ pageMode: 'off' })
        setError('Page reading needs access to websites. Chrome asks once, not per site.')
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
        onClose={() => {
          if (tabId !== null) void chrome.runtime.sendMessage({ type: 'close-panel', tabId })
        }}
      />

      <MessageList turns={turns} busy={busy} logRef={log} />

      {showSavings && savings !== null && <SavingsPanel savings={savings} />}

      {exhausted !== null && <ExhaustedNotice options={exhausted} />}

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
        session={session}
        onError={setError}
      />
    </>
  )
}
