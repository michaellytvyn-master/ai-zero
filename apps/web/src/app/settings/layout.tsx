import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { safeAuth } from '@/auth'
import SideNav from '@/components/side-nav'

export const metadata: Metadata = {
  title: 'Settings',
  // Behind a sign-in; robots.txt disallows it too, but a disallowed URL can
  // still be indexed from an external link — only the tag actually prevents it.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await safeAuth()
  if (session?.user?.id === undefined) redirect('/signin')

  return (
    <div className="dash">
      <SideNav />
      <section>{children}</section>
    </div>
  )
}
