import { useCallback, useEffect, useRef, useState } from 'react'
import { loadConversation } from '@/lib/conversations'
import type { Session } from '@/lib/session'
import {
  EMPTY_TAB_CHAT,
  type ActiveTab,
  type TabChat,
  currentTab,
  onActiveTabChanged,
  readTabChat,
  writeTabChat,
} from '@/lib/tabs'
import { type Turn, newTurn } from './turn'

/**
 * Binds the panel to whichever tab is in front. Each tab keeps its own
 * conversation, draft, model and page-context setting, so switching tabs
 * switches chats and coming back restores the one that was there.
 */
export function useTabChat(session: Session | null) {
  const [tab, setTab] = useState<ActiveTab | null>(null)
  const [chat, setChat] = useState<TabChat>(EMPTY_TAB_CHAT)
  const [turns, setTurns] = useState<Turn[]>([])
  const [loading, setLoading] = useState(true)
  const shownTab = useRef<number | null>(null)

  const show = useCallback(
    async (next: ActiveTab, force: boolean) => {
      setTab(next)
      // Title and URL updates fire for the tab already on screen; only a real
      // switch should throw away what is being typed.
      if (!force && shownTab.current === next.id) return
      shownTab.current = next.id

      setLoading(true)
      const stored = await readTabChat(next.id)
      setChat(stored)

      if (stored.conversationId === null || session === null) {
        setTurns([])
        setLoading(false)
        return
      }

      const conversation = await loadConversation(session, stored.conversationId).catch(() => null)
      if (conversation === null) {
        await writeTabChat(next.id, { conversationId: null })
        setChat({ ...stored, conversationId: null })
        setTurns([])
      } else {
        setTurns(
          conversation.messages
            .filter((message) => message.role !== 'system')
            .map((message) => {
              const turn = newTurn(message.role as Turn['role'], message.content)
              return message.providerId === null
                ? turn
                : { ...turn, answeredBy: `${message.providerId} · ${message.model ?? ''}`.trim() }
            }),
        )
      }
      setLoading(false)
    },
    [session],
  )

  useEffect(() => {
    void currentTab().then((found) => {
      if (found !== null) void show(found, false)
      else setLoading(false)
    })
    return onActiveTabChanged((next) => void show(next, false))
  }, [show])

  const patchChat = useCallback(
    (patch: Partial<TabChat>) => {
      setChat((previous) => ({ ...previous, ...patch }))
      if (tab !== null) void writeTabChat(tab.id, patch)
    },
    [tab],
  )

  const startNewChat = useCallback(() => {
    setTurns([])
    patchChat({ conversationId: null, draft: '' })
  }, [patchChat])

  return { tab, chat, turns, setTurns, patchChat, startNewChat, loading }
}
