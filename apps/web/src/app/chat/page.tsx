import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import ChatClient from '@/components/chat-client'
import { listConversations, loadConversation } from '@/lib/conversations'
import { listProviderKeys } from '@/lib/provider-keys'
import { demoRemaining } from '@/lib/usage'

export const dynamic = 'force-dynamic'

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const session = await auth()
  const userId = session?.user?.id
  if (typeof userId !== 'string') redirect('/signin')

  const { c } = await searchParams
  const [conversations, keys] = await Promise.all([
    listConversations(userId),
    listProviderKeys(userId),
  ])
  const active = c === undefined ? null : await loadConversation(userId, c)
  const allowance = keys.length > 0 ? null : await demoRemaining(userId)

  return (
    <ChatClient
      conversations={conversations.map((item) => ({
        id: item.id,
        title: item.title,
      }))}
      activeId={active?.summary.id ?? null}
      initialMessages={(active?.messages ?? []).map((message) => ({
        role: message.role,
        content: message.content,
        provider: message.providerId,
      }))}
      usingOwnKeys={keys.length > 0}
      demoRemaining={allowance?.remaining ?? null}
      demoLimit={allowance?.limit ?? null}
    />
  )
}
