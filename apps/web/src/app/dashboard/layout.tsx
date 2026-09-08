import { redirect } from 'next/navigation'
import { safeAuth } from '@/auth'
import SideNav from '@/components/side-nav'
import { isAdmin } from '@/config'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await safeAuth()
  if (session?.user?.id === undefined) redirect('/signin')

  return (
    <div className="dash">
      <SideNav admin={isAdmin(session.user.email)} />
      <section>{children}</section>
    </div>
  )
}
