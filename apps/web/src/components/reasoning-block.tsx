'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The model's working-out. Open and scrolling while it thinks, collapsed the
 * moment the real answer starts — the reasoning is context for watching, not
 * part of the reply. A reader who wants it back can open it again, and once
 * they do their choice sticks rather than being overridden by the next chunk.
 */
export default function ReasoningBlock({ text, answered }: { text: string; answered: boolean }) {
  const [open, setOpen] = useState(!answered)
  const [pinned, setPinned] = useState(false)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pinned) setOpen(!answered)
  }, [answered, pinned])

  // Follow the thought as it streams, the way a terminal follows output.
  useEffect(() => {
    if (open && body.current !== null) body.current.scrollTop = body.current.scrollHeight
  }, [open])

  const done = answered || text.length === 0

  return (
    <div className={open ? 'reasoning open' : 'reasoning'}>
      <button
        type="button"
        className="head"
        aria-expanded={open}
        onClick={() => {
          setPinned(true)
          setOpen(!open)
        }}
      >
        <span className="caret" aria-hidden="true">
          ›
        </span>
        {done ? 'Reasoning' : 'Thinking'}
        {!done && <span className="spin" />}
      </button>
      {open && (
        <div className="body" ref={body}>
          {text}
        </div>
      )}
    </div>
  )
}
