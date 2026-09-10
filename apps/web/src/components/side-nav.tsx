'use client'

import { MENU } from '@zca/shared'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Icon from './icon'

const SECTIONS = [
  {
    group: 'Workspace',
    items: [
      { href: '/settings', label: 'Overview' },
      { href: '/chat', label: 'Chat' },
    ],
  },
  {
    group: 'Connections',
    items: [
      { href: '/settings/keys', label: 'Provider keys' },
      { href: '/settings/api', label: 'API access' },
      { href: '/settings/account', label: 'Sign-in and devices' },
    ],
  },
  {
    group: 'Activity',
    items: [{ href: '/settings/limits', label: 'Limits and statistics' }],
  },
]

export default function SideNav() {
  const path = usePathname()
  // Drawer below 860px; above it the nav is simply the first grid column.
  const [open, setOpen] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger, not a value read
  useEffect(() => setOpen(false), [path])

  return (
    <>
      <div className="dashbar">
        <button
          type="button"
          className="burger"
          aria-label="Open settings menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Icon shape={MENU} size={17} />
        </button>
        <strong style={{ fontSize: 14 }}>Settings</strong>
      </div>

      {open && (
        <button
          type="button"
          className="scrim"
          aria-label="Close settings menu"
          onClick={() => setOpen(false)}
        />
      )}

      <nav className={open ? 'side open' : 'side'}>
        {SECTIONS.map((section) => (
          <div key={section.group}>
            <div className="group">{section.group}</div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={path === item.href ? 'current' : ''}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </>
  )
}
