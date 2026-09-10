'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

/**
 * Closes on a click anywhere else and on Escape, because a panel that only
 * closes by pressing its own trigger again is a panel people leave open.
 */
export default function Popover(props: {
  label: ReactNode
  title: string
  className?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="pop" ref={root}>
      <button
        type="button"
        className={`${props.className ?? 'round'}${open ? ' on' : ''}`}
        title={props.title}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((was) => !was)}
      >
        {props.label}
      </button>
      {open && (
        <div className="sheet" role="menu">
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
