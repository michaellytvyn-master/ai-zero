'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

  return (
    <nav className="side">
      {SECTIONS.map((section) => (
        <div key={section.group}>
          <div className="group">{section.group}</div>
          {section.items.map((item) => (
            <Link key={item.href} href={item.href} className={path === item.href ? 'current' : ''}>
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
