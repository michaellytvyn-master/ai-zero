import type { Savings } from '@zca/pricing'
import type { ChatMessage } from '@zca/shared'
import { useCallback } from 'react'
import { streamChat } from '@/lib/chat'
import { contextCharBudget } from '@/lib/context-budget'
import { appendMessage, createConversation } from '@/lib/conversations'
import { pickableModels } from '@/lib/models'
import { asContextMessage, readPage } from '@/lib/page-context'
import { loadSavings } from '@/lib/savings'
import { type Session, loadSession } from '@/lib/session'
import { type TabChat, savePendingAnswer } from '@/lib/tabs'
import { applyEvent } from './apply-event'
import { type Turn, newTurn } from './turn'

/** Often enough to survive a tab switch, rarely enough not to thrash storage. */
const SAVE_EVERY_MS = 500

const describe = (by: { providerId: string; model: string } | null): string | null =>
  by === null ? null : `${by.providerId} · ${by.model}`

export interface SendDeps {
  readonly session: Session | null
  readonly tabId: number | null
  readonly chat: TabChat
  readonly turns: Turn[]
  readonly busy: boolean
  readonly setTurns: React.Dispatch<React.SetStateAction<Turn[]>>
  readonly patchChat: (patch: Partial<TabChat>) => void
  readonly setBusy: (busy: boolean) => void
  readonly setError: (message: string | null) => void
  readonly setExhausted: (options: { label: string; url: string }[] | null) => void
  readonly setProvider: (providerId: string) => void
  readonly setAttached: (summary: string | null) => void
  readonly onRefreshed: (session: Session, savings: Savings | null) => void
}

/**
 * One turn end to end: optional page context, a conversation to file it under,
 * the stream itself, then archiving the answer. Extracted from the panel so the
 * component stays about rendering.
 */
export function useSend(deps: SendDeps): () => Promise<void> {
  const { session, chat, turns } = deps

  return useCallback(async () => {
    const content = chat.draft.trim()
    if (content.length === 0 || deps.busy || session === null) return

    deps.patchChat({ draft: '' })
    deps.setBusy(true)
    deps.setError(null)
    deps.setExhausted(null)

    const history: ChatMessage[] = [...turns, { role: 'user' as const, content }].map((turn) => ({
      role: turn.role,
      content: turn.content,
    }))
    deps.setTurns((previous) => [...previous, newTurn('user', content), newTurn('assistant', '')])

    if (chat.pageMode !== 'off' && deps.tabId !== null) {
      try {
        const budget = contextCharBudget(pickableModels(session), chat.model)
        const page = await readPage(deps.tabId, chat.pageMode, budget)
        history.unshift({ role: 'system', content: asContextMessage(page) })
        deps.setAttached(
          `${page.title || page.url} · ${page.mode} · ${page.content.length.toLocaleString()} chars${
            page.truncated ? ' (truncated)' : ''
          }`,
        )
      } catch (cause) {
        deps.setError(cause instanceof Error ? cause.message : 'Could not read the page.')
        deps.setTurns((previous) => previous.slice(0, -2))
        deps.setBusy(false)
        return
      }
    } else {
      deps.setAttached(null)
    }

    let conversationId = chat.conversationId
    if (conversationId === null) {
      conversationId = await createConversation(session, content).catch(() => null)
      if (conversationId !== null) deps.patchChat({ conversationId })
    }
    if (conversationId !== null) {
      await appendMessage(session, conversationId, { role: 'user', content })
    }

    let answer = ''
    let answeredBy: { providerId: string; model: string } | null = null
    let lastSaved = 0

    for await (const event of streamChat(
      session,
      history,
      chat.model,
      chat.responseMode,
      new AbortController().signal,
    )) {
      if (event.kind === 'delta') answer += event.content
      if (event.kind === 'provider') {
        answeredBy = { providerId: event.providerId, model: event.model }
      }

      // Chrome tears the panel down the moment the user leaves this tab, so
      // the partial answer is parked where a fresh panel can pick it up.
      if (deps.tabId !== null && Date.now() - lastSaved > SAVE_EVERY_MS) {
        lastSaved = Date.now()
        void savePendingAnswer(deps.tabId, answer, describe(answeredBy))
      }
      applyEvent(event, {
        setTurns: deps.setTurns,
        setProvider: deps.setProvider,
        setExhausted: deps.setExhausted,
        setError: deps.setError,
      })
    }

    if (conversationId !== null && answer.length > 0) {
      await appendMessage(session, conversationId, {
        role: 'assistant',
        content: answer,
        ...(answeredBy ?? {}),
      })
    }
    // Archived, so a returning panel must not restore it a second time.
    if (deps.tabId !== null) await savePendingAnswer(deps.tabId, '', null)

    deps.setBusy(false)
    const refreshed = await loadSession()
    if (refreshed !== null) deps.onRefreshed(refreshed, await loadSavings(refreshed))
  }, [chat, deps, session, turns])
}
