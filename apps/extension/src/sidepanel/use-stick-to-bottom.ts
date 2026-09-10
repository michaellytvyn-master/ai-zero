import { type RefObject, useEffect, useRef } from 'react'

/** How close to the bottom still counts as being at the bottom. */
const SLACK = 48

/**
 * Pulled out of the hook so the rule can be tested without a DOM. Generous
 * enough to survive sub-pixel rounding between scrollHeight and clientHeight,
 * tight enough that a reader who scrolled up is not counted as following.
 */
export function isAtBottom(scrollHeight: number, scrollTop: number, clientHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight <= SLACK
}

/**
 * Keeps the panel pinned to the newest text while the reader is at the bottom,
 * and stops as soon as they scroll up. The previous version scrolled on every
 * change unconditionally, which snatched the view back mid-sentence from
 * anyone reading an earlier answer.
 *
 * Mirrors apps/web/src/components/use-stick-to-bottom.ts; the two apps do not
 * share React code.
 */
export function useStickToBottom<T extends HTMLElement>(
  ref: RefObject<T | null>,
  growth: number,
): void {
  const stuck = useRef(true)

  useEffect(() => {
    const node = ref.current
    if (node === null) return

    const onScroll = () => {
      stuck.current = isAtBottom(node.scrollHeight, node.scrollTop, node.clientHeight)
    }
    node.addEventListener('scroll', onScroll, { passive: true })
    return () => node.removeEventListener('scroll', onScroll)
  }, [ref])

  // biome-ignore lint/correctness/useExhaustiveDependencies: growth is the trigger, not a value read
  useEffect(() => {
    const node = ref.current
    if (node === null || !stuck.current) return
    // Instant rather than the stylesheet's smooth: one animation per token
    // never finishes, so the view lags behind the text.
    node.scrollTo({ top: node.scrollHeight, behavior: 'instant' })
  }, [ref, growth])
}

export function contentLength(
  turns: readonly { content: string; reasoning?: string | undefined }[],
): number {
  return turns.reduce(
    (total, turn) => total + turn.content.length + (turn.reasoning?.length ?? 0),
    turns.length,
  )
}
