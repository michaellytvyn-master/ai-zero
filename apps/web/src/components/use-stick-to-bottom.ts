'use client'

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
 * Keeps a scrolling pane pinned to its newest content while the reader is at
 * the bottom, and stops the moment they scroll up to read something — pulling
 * someone back down mid-sentence is worse than making them scroll.
 *
 * `growth` should change whenever the content gets longer: a token arriving, a
 * turn appearing. It is a number rather than the turns themselves so the effect
 * does not re-run on unrelated re-renders.
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
    // Instant, not the stylesheet's smooth: during streaming each token would
    // restart the animation and the view would never catch up with the text.
    node.scrollTo({ top: node.scrollHeight, behavior: 'instant' })
  }, [ref, growth])
}

/** The one number that says "there is more text than there was". */
export function contentLength(
  turns: readonly { content: string; reasoning?: string | undefined }[],
): number {
  return turns.reduce(
    (total, turn) => total + turn.content.length + (turn.reasoning?.length ?? 0),
    turns.length,
  )
}
