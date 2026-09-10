import type { Savings } from '@zca/pricing'
import { useEffect, useRef, useState } from 'react'
import { usesOwnKeys } from '@/lib/chat'
import { canSearch } from '@/lib/web-context'
import type { PageMode } from '@/lib/page-context'
import { hasPageAccess, isReadable, requestPageAccess } from '@/lib/permissions'
import { loadSavings } from '@/lib/savings'
import { type Session, loadSession, signOut } from '@/lib/session'
import { readGrouping, writeGrouping } from '@/lib/grouping'
import { takePendingQuote } from '@/lib/tabs'
import Composer from './Composer'
import ExhaustedNotice from './ExhaustedNotice'
import Header from './Header'
import MessageList from './MessageList'
import ConfirmGate from './ConfirmGate'
import { useAct } from './use-act'
import { useConfirm } from './use-confirm'
import { contentLength, useStickToBottom } from './use-stick-to-bottom'
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
  const [grouping, setGrouping] = useState(true)
  const [pageAccess, setPageAccess] = useState(false)
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
    void readGrouping().then(setGrouping)
  }, [])

  useEffect(() => {
    if (tabId === null) return
    void takePendingQuote(tabId).then((quote) => {
      if (quote !== null) patchChat({ draft: `"""\n${quote}\n"""\n\n` })
    })
  }, [patchChat, tabId])

  // Page reading is on by default, but only makes sense once access exists.
  // Quietly falling back beats defaulting to a setting that errors on first use.
  // The same grant is what acting needs, so the answer is kept rather than
  // asked for twice.
  useEffect(() => {
    void hasPageAccess().then((granted) => {
      setPageAccess(granted)
      if (!granted && chat.pageMode !== 'off') patchChat({ pageMode: 'off' })
    })
  }, [chat.pageMode, patchChat])

  // Acting injects a script on every step, so a revoked grant makes the whole
  // mode a series of failures. Switch it off rather than let it fail silently.
  useEffect(() => {
    if (!pageAccess && chat.act) patchChat({ act: false })
  }, [pageAccess, chat.act, patchChat])

  useStickToBottom(log, contentLength(turns))

  const { pending, ask, answer } = useConfirm()

  const act = useAct({
    session: signedIn,
    tabId,
    chat,
    busy,
    setTurns,
    patchChat,
    setBusy,
    setError,
    confirm: ask,
  })

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
        setPageAccess(true)
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
        grouping={grouping}
        onGrouping={(on) => {
          setGrouping(on)
          void writeGrouping(on, tab)
        }}
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

      {pending !== null && <ConfirmGate pending={pending} onAnswer={answer} />}

      <Composer
        draft={chat.draft}
        onDraft={(draft) => patchChat({ draft })}
        onSend={() => void (chat.act ? act() : send())}
        busy={busy}
        pageMode={chat.pageMode}
        onPageMode={choosePageMode}
        model={chat.model}
        onModel={(model) => patchChat({ model })}
        searchWeb={chat.searchWeb}
        onSearchWeb={(searchWeb) => patchChat({ searchWeb })}
        act={chat.act}
        onAct={(act) => patchChat({ act })}
        // Acting needs the same page access reading does; without it every
        // step would fail on the first injection.
        canAct={pageAccess}
        canSearch={canSearch(session)}
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
