import type { ChatChunk } from '@zca/shared'
import { useCallback } from 'react'
import { AGENT_TOOLS } from '@/lib/actions'
import { type AgentEvent, runAgent } from '@/lib/agent'
import { type ChatEvent, streamChat } from '@/lib/chat'
import { clickRef, indexPage, scrollPage, selectRef, typeRef } from '@/lib/page-agent'
import type { Session } from '@/lib/session'
import type { TabChat } from '@/lib/tabs'
import { type Turn, newTurn } from './turn'

export interface ActDeps {
  readonly session: Session | null
  readonly tabId: number | null
  readonly chat: TabChat
  readonly busy: boolean
  readonly setTurns: React.Dispatch<React.SetStateAction<Turn[]>>
  readonly patchChat: (patch: Partial<TabChat>) => void
  readonly setBusy: (busy: boolean) => void
  readonly setError: (message: string | null) => void
  readonly confirm: (question: string) => Promise<boolean>
}

/**
 * The panel's event stream carries provider and error news the agent loop has
 * no use for; this passes through only what it reads.
 */
async function* asChunks(events: AsyncIterable<ChatEvent>): AsyncIterable<ChatChunk> {
  for await (const event of events) {
    if (event.kind === 'delta') yield { kind: 'delta', content: event.content }
    else if (event.kind === 'reasoning') yield { kind: 'reasoning', content: event.content }
    else if (event.kind === 'tool_call') {
      yield { kind: 'tool_call', id: event.id, name: event.name, args: event.args }
    } else if (event.kind === 'error') throw new Error(event.message)
  }
}

/** One line in the panel for each thing the agent did. */
function line(event: AgentEvent): string | null {
  if (event.kind === 'acted') return `· ${event.what}`
  if (event.kind === 'refused') return `✕ ${event.what} — ${event.because}`
  if (event.kind === 'declined') return `✕ ${event.what} — you said no`
  if (event.kind === 'done' && event.reason === 'step_limit') {
    return '· stopped at the step limit'
  }
  return null
}

/**
 * Acting on the page, as opposed to answering about it. Kept apart from
 * useSend because almost nothing is shared: there is no conversation history to
 * file, no page context to attach, and the answer is a sequence of actions
 * rather than a stream of text.
 */
export function useAct(deps: ActDeps): () => Promise<void> {
  const { session, chat, tabId } = deps

  return useCallback(async () => {
    const goal = chat.draft.trim()
    if (goal.length === 0 || deps.busy || session === null || tabId === null) return

    deps.patchChat({ draft: '' })
    deps.setBusy(true)
    deps.setError(null)
    deps.setTurns((previous) => [...previous, newTurn('user', goal), newTurn('assistant', '')])

    const append = (text: string) =>
      deps.setTurns((previous) => {
        const last = previous[previous.length - 1]
        if (last === undefined) return previous
        const content = last.content.length === 0 ? text : `${last.content}\n${text}`
        return [...previous.slice(0, -1), { ...last, content }]
      })

    const controller = new AbortController()
    try {
      for await (const event of runAgent(
        {
          index: () => indexPage(tabId),
          click: (ref) => clickRef(tabId, ref),
          type: (ref, text) => typeRef(tabId, ref, text),
          select: (ref, option) => selectRef(tabId, ref, option),
          scroll: (direction) => scrollPage(tabId, direction),
          confirm: deps.confirm,
          think: (messages) =>
            asChunks(
              streamChat(
                session,
                messages,
                chat.model,
                chat.responseMode,
                controller.signal,
                AGENT_TOOLS,
              ),
            ),
        },
        goal,
      )) {
        if (event.kind === 'say') append(event.text)
        else {
          const rendered = line(event)
          if (rendered !== null) append(rendered)
        }
      }
    } catch (error) {
      deps.setError(error instanceof Error ? error.message : String(error))
    } finally {
      deps.setBusy(false)
    }
  }, [session, chat, tabId, deps])
}
