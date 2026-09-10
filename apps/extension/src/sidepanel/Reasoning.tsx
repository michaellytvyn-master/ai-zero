import { useEffect, useRef, useState } from 'react'

/**
 * Mirrors the web app's block: open while the model thinks, collapsed once the
 * answer starts, and reopenable. Panel-sized, so the body is shorter here.
 */
export default function Reasoning({ text, answered }: { text: string; answered: boolean }) {
  const [open, setOpen] = useState(!answered)
  const [pinned, setPinned] = useState(false)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pinned) setOpen(!answered)
  }, [answered, pinned])

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
      </button>
      {open && (
        <div className="body" ref={body}>
          {text}
        </div>
      )}
    </div>
  )
}
