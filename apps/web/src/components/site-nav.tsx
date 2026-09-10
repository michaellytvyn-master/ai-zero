'use client'

import { CLOSE, MENU } from '@zca/shared'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Icon from './icon'
import { SITE_NAME } from '@/lib/site'

/**
 * The top bar and its small-screen drawer, in one component because the drawer
 * must be a *sibling* of the bar rather than a child of it. The bar carries a
 * backdrop-filter, and a filter makes an element the containing block for its
 * fixed-position descendants — a drawer nested inside it was sized against the
 * 57px bar instead of the viewport, and its width was added to the document's,
 * which is what pushed the page sideways.
 *
 * The desktop links stay in the markup and are hidden by CSS, so a crawler and
 * a visitor without JavaScript still see every link.
 */
export default function SiteNav({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false)
  const path = usePathname()

  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger, not a value read
  useEffect(() => setOpen(false), [path])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <nav className="nav">
        <Link href="/">{SITE_NAME}</Link>
        {email !== null && (
          <Link href="/chat" className="desk">
            Chat
          </Link>
        )}
        {email !== null && (
          <Link href="/settings" className="desk">
            Settings
          </Link>
        )}
        <span className="spacer" />
        <Link href="/privacy" className="muted desk">
          Privacy
        </Link>
        <Link href="/terms" className="muted desk">
          Terms
        </Link>
        {email === null ? (
          <>
            <Link href="/signin" className="desk">
              Sign in
            </Link>
            <Link href="/register" className="desk">
              <button className="primary" type="button" style={{ padding: '5px 12px' }}>
                Sign up
              </button>
            </Link>
          </>
        ) : (
          <span className="muted desk">{email}</span>
        )}
        <button
          type="button"
          className="burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon shape={open ? CLOSE : MENU} size={17} />
        </button>
      </nav>

      {open && (
        <button
          type="button"
          className="scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Kept mounted so it can slide, but inert while closed — otherwise its
          links stay in the tab order off the side of the screen. */}
      <div className={open ? 'drawer right navdrawer open' : 'drawer right navdrawer'}>
        {email !== null && <Link href="/chat">Chat</Link>}
        {email !== null && <Link href="/settings">Settings</Link>}
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        {email === null ? (
          <>
            <Link href="/signin">Sign in</Link>
            <Link href="/register">
              <button className="primary" type="button">
                Sign up
              </button>
            </Link>
          </>
        ) : (
          <div className="who">{email}</div>
        )}
      </div>
    </>
  )
}
