'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useRef, useState } from 'react'
import type { ModelChoice } from '@zca/providers'
import { readSse } from '@zca/shared'
import ModelPicker from './model-picker'

interface Turn {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  provider?: string | null
  model?: string | null
}

interface KeyPrompt {
  providerId: string
  label: string
  signupUrl: string
}

export default function ChatClient(props: {
  conversations: { id: string; title: string }[]
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
  const [needsKey, setNeedsKey] = useState<KeyPrompt[] | null>(null)
  const [remaining, setRemaining] = useState(props.demoRemaining)
  const [model, setModel] = useState(props.initialModel)
  const conversationId = useRef(props.activeId)

  async function send() {
    const content = draft.trim()
    if (content.length === 0 || busy) return

    setDraft('')
    setBusy(true)
    setNeedsKey(null)
    setTurns((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: 'user', content },
      { id: crypto.randomUUID(), role: 'assistant', content: '' },
    ])

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        model,
        ...(conversationId.current !== null && { conversationId: conversationId.current }),
      }),
    })

    if (!response.ok || response.body === null) {
      const body = (await response.json().catch(() => null)) as {
        error?: { type?: string; message?: string; addYourOwnKey?: KeyPrompt[] }
      } | null
      if (body?.error?.type === 'demo_exhausted') {
        setNeedsKey(body.error.addYourOwnKey ?? [])
        setRemaining(0)
        setTurns((previous) => previous.slice(0, -2))
      } else {
        setTurns((previous) =>
          replaceLast(previous, body?.error?.message ?? 'Something went wrong.'),
        )
      }
      setBusy(false)
      return
    }

    for await (const event of readSse(response.body)) {
      if (event.name === 'meta') {
        conversationId.current = String(event.data.conversationId)
        setProvider(String(event.data.provider))
        // The reply is tagged with whoever actually answered, which may differ
        // from the pick when the chosen provider was rate limited.
        const answered = { provider: String(event.data.provider), model: String(event.data.model) }
        setTurns((previous) => {
          const last = previous[previous.length - 1]
          if (last === undefined) return previous
          return [...previous.slice(0, -1), { ...last, ...answered }]
        })
      } else if (event.name === 'delta') {
        const chunk = String(event.data.content)
        setTurns((previous) => appendToLast(previous, chunk))
      }
    }

    if (remaining !== null)
      setRemaining((value) => (value === null ? null : Math.max(0, value - 1)))
    setBusy(false)
    router.refresh()
  }

  return (
    <main
      style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 'calc(100vh - 52px)' }}
    >
      <aside style={{ borderRight: '1px solid var(--border)', padding: 14, overflowY: 'auto' }}>
        <Link href="/chat">
          <button type="button" style={{ width: '100%', marginBottom: 12 }}>
            New chat
          </button>
        </Link>
        {props.conversations.map((item) => (
          <Link
            key={item.id}
            href={`/chat?c=${item.id}`}
            style={{
              display: 'block',
              padding: '7px 9px',
              borderRadius: 7,
              fontSize: 13,
              textDecoration: 'none',
              color: item.id === props.activeId ? 'var(--text)' : 'var(--muted)',
              background: item.id === props.activeId ? 'var(--surface)' : 'transparent',
            }}
          >
            {item.title}
          </Link>
        ))}
      </aside>

      <section style={{ display: 'flex', flexDirection: 'column', padding: 20, gap: 14 }}>
        <div className="row muted" style={{ fontSize: 13 }}>
          {provider !== null && <span>answered by {provider}</span>}
          {!props.usingOwnKeys && remaining !== null && (
            <span>
              {remaining} of {props.demoLimit} free messages left today ·{' '}
              <Link href="/account">add your own key</Link>
            </span>
          )}
          {props.usingOwnKeys && <span>running on your own keys</span>}
        </div>

        <div
          style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {turns.map((turn, index) => (
            <div key={turn.id} className="card" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                {turn.role}
                {turn.provider != null && ` · ${turn.provider}`}
                {turn.model != null && ` · ${turn.model}`}
              </div>
              {turn.content || (busy && index === turns.length - 1 ? '…' : '')}
            </div>
          ))}
        </div>

        {needsKey !== null && (
          <div className="card">
            <strong>You have used today&apos;s free messages.</strong>
            <p className="muted" style={{ marginBottom: 8 }}>
              Add a free key of your own and this cap stops applying to you.
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {needsKey.map((item) => (
                <a key={item.providerId} href={item.signupUrl} target="_blank" rel="noreferrer">
                  Get a free {item.label} key
                </a>
              ))}
              <Link href="/account">
                <button type="button" className="primary">
                  Add it here
                </button>
              </Link>
            </div>
          </div>
        )}

        <ModelPicker
          models={props.models}
          value={props.usingOwnKeys ? model : 'auto'}
          onChange={setModel}
          disabled={!props.usingOwnKeys}
          disabledReason="the shared pool runs the smallest model; add your own key to choose"
        />

        <div className="row">
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
          <button type="button" className="primary" disabled={busy} onClick={() => void send()}>
            Send
          </button>
        </div>
      </section>
    </main>
  )
}

function appendToLast(turns: Turn[], chunk: string): Turn[] {
  const last = turns[turns.length - 1]
  if (last === undefined) return turns
  return [...turns.slice(0, -1), { ...last, content: last.content + chunk }]
}

function replaceLast(turns: Turn[], content: string): Turn[] {
  const last = turns[turns.length - 1]
  if (last === undefined) return turns
  return [...turns.slice(0, -1), { ...last, content }]
}
