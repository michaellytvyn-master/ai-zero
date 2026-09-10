import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmQueue, type PendingQuestion } from '@/lib/confirm-queue'

export type { PendingQuestion as Pending }

/**
 * Turns a button press into the answer of a promise, so the agent loop can
 * simply `await confirm(...)`. The rules live in ConfirmQueue, which is tested.
 */
export function useConfirm(): {
  pending: PendingQuestion | null
  ask: (question: string) => Promise<boolean>
  answer: (allowed: boolean) => void
} {
  const [pending, setPending] = useState<PendingQuestion | null>(null)
  const queue = useRef(new ConfirmQueue())

  // Anything still open when the panel unmounts is answered no.
  useEffect(() => () => queue.current.abandon(), [])

  const ask = useCallback((question: string) => queue.current.ask(question, setPending), [])
  const answer = useCallback((allowed: boolean) => queue.current.answer(allowed, setPending), [])

  return { pending, ask, answer }
}
