'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { ModelChoice } from '@zca/providers'
import { DEFAULT_RESPONSE_MODE, type ResponseMode, isResponseMode } from '@zca/shared'
import ConversationList from './conversation-list'
import MessageLog from './message-log'
import { streamChatTurn } from '@/lib/chat-stream'
import { generateImage } from '@/lib/generate-image'
import ChatControls from './chat-controls'
import MicButton from './mic-button'
import { type Turn, appendToLast, replaceLast } from './turn'
import KeyPrompt from './key-prompt'

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
  const [remaining, setRemaining] = useState(props.demoRemaining)
  const [model, setModel] = useState(props.initialModel)
  // Remembered per browser: how you like answers is a preference, not a
  // property of any one conversation.
  const [mode, setMode] = useState<ResponseMode>(DEFAULT_RESPONSE_MODE)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('responseMode')
      if (isResponseMode(saved)) setMode(saved)
    } catch {
      // Private windows and blocked storage both land here; the default is fine.
    }
  }, [])

  function chooseMode(next: ResponseMode) {
    setMode(next)
    try {
      localStorage.setItem('responseMode', next)
    } catch {
      // Failing to remember the choice must not stop them making it.
    }
  }
  const conversationId = useRef(props.activeId)

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
      { content, model, mode, conversationId: conversationId.current },
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
    setBusy(false)
    router.refresh()
  }
  return (
    <main
      style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 'calc(100vh - 52px)' }}
    >
      <ConversationList
        conversations={props.conversations}
        nextCursor={props.nextCursor}
        activeId={props.activeId}
      />

      <section style={{ display: 'flex', flexDirection: 'column', padding: 20, gap: 14 }}>
        <div className="row muted" style={{ fontSize: 13 }}>
          {provider !== null && <span>answered by {provider}</span>}
          {!props.usingOwnKeys && remaining !== null && (
            <span>
              {remaining} of {props.demoLimit} free messages left today ·{' '}
              <Link href="/dashboard/keys">add your own key</Link>
            </span>
          )}
          {props.usingOwnKeys && <span>running on your own keys</span>}
        </div>

        <MessageLog turns={turns} busy={busy} />

        {needsKey !== null && <KeyPrompt providers={needsKey} />}
        {error !== null && <p className="error">{error}</p>}

        <ChatControls
          mode={mode}
          onMode={chooseMode}
          models={props.models}
          model={model}
          onModel={setModel}
          usingOwnKeys={props.usingOwnKeys}
          makeImage={makeImage}
          onMakeImage={setMakeImage}
        />

        <div className="composer-box">
          <textarea
            rows={2}
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
          <MicButton
            onText={(text) => setDraft((previous) => (previous ? `${previous} ${text}` : text))}
            onError={(message) => setError(message.length > 0 ? message : null)}
          />
          <button type="button" className="primary" disabled={busy} onClick={() => void send()}>
            Send
          </button>
        </div>
      </section>
    </main>
  )
}
