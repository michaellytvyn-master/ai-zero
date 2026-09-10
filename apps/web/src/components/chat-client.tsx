'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useRef, useState } from 'react'
import type { ModelChoice } from '@zca/providers'
import ConversationList from './conversation-list'
import MessageLog from './message-log'
import { type Attachment, MENU, asAttachmentMessage } from '@zca/shared'
import { streamChatTurn } from '@/lib/chat-stream'
import { generateImage } from '@/lib/generate-image'
import { useRememberedMode } from './use-remembered-mode'
import Composer from './composer'
import { type Turn, appendReasoningToLast, appendToLast, replaceLast } from './turn'
import KeyPrompt from './key-prompt'
import { contentLength, useStickToBottom } from './use-stick-to-bottom'
import Icon from './icon'

interface SignupOption {
  providerId: string
  label: string
  signupUrl: string
}

export default function ChatClient(props: {
  conversations: { id: string; title: string; updatedAt: string }[]
  nextCursor: string | null
  activeId: string | null
  initialMessages: Omit<Turn, 'id'>[]
  usingOwnKeys: boolean
  demoRemaining: number | null
  demoLimit: number | null
  models: ModelChoice[]
  initialModel: string
}) {
  const router = useRouter()
  const [turns, setTurns] = useState<Turn[]>(() =>
    props.initialMessages.map((turn) => ({ ...turn, id: crypto.randomUUID() })),
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState<string | null>(null)
  const [needsKey, setNeedsKey] = useState<SignupOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [makeImage, setMakeImage] = useState(false)
  const [searchWeb, setSearchWeb] = useState(false)
  const [files, setFiles] = useState<Attachment[]>([])
  const [remaining, setRemaining] = useState(props.demoRemaining)
  const [model, setModel] = useState(props.initialModel)
  // Conversation drawer, below 860px only.
  const [drawer, setDrawer] = useState(false)

  const log = useRef<HTMLDivElement>(null)
  useStickToBottom(log, contentLength(turns))
  const [mode, chooseMode] = useRememberedMode()
  const conversationId = useRef<string | null>(props.activeId)

  async function send() {
    const content = draft.trim()
    if (content.length === 0 || busy) return

    setDraft('')
    setBusy(true)
    setNeedsKey(null)
    setError(null)
    setTurns((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: 'user', content },
      { id: crypto.randomUUID(), role: 'assistant', content: '' },
    ])

    if (makeImage) {
      const outcome = await generateImage(content, conversationId.current)
      if (outcome.ok) {
        setTurns((previous) =>
          replaceLast(previous, '').map((turn, index, all) =>
            index === all.length - 1 ? { ...turn, image: outcome.image } : turn,
          ),
        )
      } else {
        if (outcome.exhausted) setNeedsKey([])
        setError(outcome.message)
        setTurns((previous) => previous.slice(0, -2))
      }
      setBusy(false)
      router.refresh()
      return
    }

    let spent = false
    await streamChatTurn(
      {
        content,
        model,
        mode,
        searchWeb,
        attached: files.length === 0 ? null : asAttachmentMessage(files),
        conversationId: conversationId.current,
      },
      {
        onMeta: (meta) => {
          conversationId.current = meta.conversationId
          setProvider(meta.provider)
          // Tagged with whoever actually answered, which differs from the pick
          // when that provider was rate limited and failover stepped in.
          setTurns((previous) => {
            const last = previous[previous.length - 1]
            if (last === undefined) return previous
            return [
              ...previous.slice(0, -1),
              { ...last, provider: meta.provider, model: meta.model },
            ]
          })
          spent = true
        },
        onDelta: (chunk) => setTurns((previous) => appendToLast(previous, chunk)),
        onReasoning: (chunk) => setTurns((previous) => appendReasoningToLast(previous, chunk)),
        onExhausted: (options) => {
          setNeedsKey(options)
          setRemaining(0)
          setTurns((previous) => previous.slice(0, -2))
        },
        onFailed: (message) => setTurns((previous) => replaceLast(previous, message)),
      },
    )

    if (spent && remaining !== null) {
      setRemaining((value) => (value === null ? null : Math.max(0, value - 1)))
    }
    setFiles([])
    setBusy(false)
    router.refresh()
  }
  return (
    <main className="chatlayout">
      <ConversationList
        conversations={props.conversations}
        nextCursor={props.nextCursor}
        activeId={props.activeId}
        open={drawer}
        onNavigate={() => setDrawer(false)}
      />
      {drawer && (
        <button
          type="button"
          className="scrim"
          aria-label="Close conversations"
          onClick={() => setDrawer(false)}
        />
      )}

      <section className="chatpane">
        <div className="row muted" style={{ fontSize: 13 }}>
          <button
            type="button"
            className="burger"
            aria-label="Open conversations"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            <Icon shape={MENU} size={17} />
          </button>
          {provider !== null && <span>answered by {provider}</span>}
          {!props.usingOwnKeys && remaining !== null && (
            <span>
              {remaining} of {props.demoLimit} free messages left today ·{' '}
              <Link href="/settings/keys">add your own key</Link>
            </span>
          )}
          {props.usingOwnKeys && <span>running on your own keys</span>}
        </div>

        <MessageLog turns={turns} busy={busy} logRef={log} />

        {needsKey !== null && <KeyPrompt providers={needsKey} />}
        {error !== null && <p className="error">{error}</p>}

        <Composer
          draft={draft}
          onDraft={setDraft}
          onSend={() => void send()}
          busy={busy}
          files={files}
          onFiles={setFiles}
          onError={setError}
          mode={mode}
          onMode={chooseMode}
          models={props.models}
          model={model}
          onModel={setModel}
          usingOwnKeys={props.usingOwnKeys}
          makeImage={makeImage}
          onMakeImage={setMakeImage}
          searchWeb={searchWeb}
          onSearchWeb={setSearchWeb}
        />
      </section>
    </main>
  )
}
