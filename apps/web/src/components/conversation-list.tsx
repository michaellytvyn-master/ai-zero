'use client'

import { TRASH } from '@zca/shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './icon'

export interface ConversationRow {
  id: string
  title: string
  updatedAt: string
}

export default function ConversationList(props: {
  conversations: ConversationRow[]
  nextCursor: string | null
  activeId: string | null
}) {
  const router = useRouter()
  const [rows, setRows] = useState(props.conversations)
  const [cursor, setCursor] = useState(props.nextCursor)
  const [loading, setLoading] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (cursor === null || loading) return
    setLoading(true)
    try {
      const response = await fetch(`/api/conversations?before=${encodeURIComponent(cursor)}`)
      if (response.ok) {
        const page = (await response.json()) as {
          conversations: ConversationRow[]
          nextCursor: string | null
        }
        setRows((previous) => [...previous, ...page.conversations])
        setCursor(page.nextCursor)
      } else setCursor(null)
    } finally {
      setLoading(false)
    }
  }, [cursor, loading])

  // Loads the next page when the end of the list scrolls into view, rather
  // than fetching everything a heavy user has ever written up front.
  useEffect(() => {
    const target = sentinel.current
    if (target === null || cursor === null) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [cursor, loadMore])

  async function remove(id: string) {
    const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    if (!response.ok) return
    setRows((previous) => previous.filter((row) => row.id !== id))
    if (id === props.activeId) router.push('/chat')
    else router.refresh()
  }

  return (
    <aside className="chatlist">
      <Link href="/chat">
        <button type="button" className="wide">
          New chat
        </button>
      </Link>

      {rows.map((row) => (
        <div key={row.id} className={row.id === props.activeId ? 'chatrow current' : 'chatrow'}>
          <Link href={`/chat?c=${row.id}`}>{row.title}</Link>
          <button
            type="button"
            className="icon"
            title="Delete this chat"
            onClick={() => void remove(row.id)}
          >
            <Icon shape={TRASH} size={14} />
          </button>
        </div>
      ))}

      {rows.length === 0 && <p className="muted small">No conversations yet.</p>}
      <div ref={sentinel} />
      {loading && <p className="muted small">Loading…</p>}
    </aside>
  )
}
