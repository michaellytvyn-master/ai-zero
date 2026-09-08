'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  {
    group: 'Account',
    items: [
      { href: '/dashboard', label: 'Overview' },
      { href: '/chat', label: 'Chat' },
    ],
  },
  {
    group: 'Connections',
    items: [
      { href: '/dashboard/keys', label: 'Provider keys' },
      { href: '/dashboard/settings', label: 'Sign-in and devices' },
    ],
  },
  { group: 'Activity', items: [{ href: '/dashboard/usage', label: 'Usage and savings' }] },
]

export default function SideNav({ admin }: { admin: boolean }) {
  const path = usePathname()

  return (
    <nav className="side">
      {LINKS.map((section) => (
        <div key={section.group}>
          <div className="group">{section.group}</div>
          {section.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={path === item.href ? 'current' : ''}
              style={{ display: 'block' }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
      {admin && (
        <div>
          <div className="group">Operator</div>
          <Link
            href="/admin"
            className={path === '/admin' ? 'current' : ''}
            style={{ display: 'block' }}
          >
            All usage
          </Link>
        </div>
      )}
    </nav>
  )
}
