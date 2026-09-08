import { useCallback, useEffect, useState } from 'react'
import { loadConversation } from '@/lib/conversations'
import type { Session } from '@/lib/session'
import {
  EMPTY_TAB_CHAT,
  type OwnTab,
  type TabChat,
  onOwnTabChanged,
  ownTab,
  panelTabId,
  readTabChat,
  writeTabChat,
} from '@/lib/tabs'
import { type Turn, newTurn } from './turn'

/**
 * This panel belongs to exactly one tab, named in its own URL. Its conversation,
 * draft, model and page-context setting are that tab's, and a panel on another
 * tab is a separate document with its own.
 */
export function useTabChat(session: Session | null) {
  const [tabId] = useState(panelTabId)
  const [tab, setTab] = useState<OwnTab | null>(null)
  const [chat, setChat] = useState<TabChat>(EMPTY_TAB_CHAT)
  const [turns, setTurns] = useState<Turn[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (tabId === null) {
      setLoading(false)
      return
    }
    void ownTab(tabId).then(setTab)
    return onOwnTabChanged(tabId, setTab)
  }, [tabId])

  useEffect(() => {
    if (tabId === null) return
    let cancelled = false

    void (async () => {
      const stored = await readTabChat(tabId)
      if (cancelled) return
      setChat(stored)

      if (stored.conversationId === null || session === null) {
        setTurns([])
        setLoading(false)
        return
      }

      const conversation = await loadConversation(session, stored.conversationId).catch(() => null)
      if (cancelled) return

      if (conversation === null) {
        await writeTabChat(tabId, { conversationId: null })
        setChat({ ...stored, conversationId: null })
        setTurns([])
      } else {
        setTurns(conversation.messages.filter((m) => m.role !== 'system').map(toTurn))
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [session, tabId])

  const patchChat = useCallback(
    (patch: Partial<TabChat>) => {
      setChat((previous) => ({ ...previous, ...patch }))
      if (tabId !== null) void writeTabChat(tabId, patch)
    },
    [tabId],
  )

  const startNewChat = useCallback(() => {
    setTurns([])
    patchChat({ conversationId: null, draft: '' })
  }, [patchChat])

  return { tabId, tab, chat, turns, setTurns, patchChat, startNewChat, loading }
}

function toTurn(message: {
  role: string
  content: string
  providerId: string | null
  model: string | null
}): Turn {
  const turn = newTurn(message.role as Turn['role'], message.content)
  if (message.providerId === null) return turn
  return { ...turn, answeredBy: `${message.providerId} · ${message.model ?? ''}`.trim() }
}
