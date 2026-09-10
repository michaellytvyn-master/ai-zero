import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { modelCatalogue } from '@/lib/model-catalogue'
import { safeAuth } from '@/auth'
import ChatClient from '@/components/chat-client'
import { listConversations, loadConversation } from '@/lib/conversations'
import { listProviderKeys } from '@/lib/provider-keys'
import { demoRemaining } from '@/lib/usage'

export const metadata: Metadata = {
  title: 'Chat',
  // Behind a sign-in; robots.txt disallows it too, but a disallowed URL can
  // still be indexed from an external link — only the tag actually prevents it.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const session = await safeAuth()
  const userId = session?.user?.id
  if (typeof userId !== 'string') redirect('/signin')

  const { c } = await searchParams
  const [conversations, keys] = await Promise.all([
    listConversations(userId),
    listProviderKeys(userId),
  ])
  const active = c === undefined ? null : await loadConversation(userId, c)

  // Reopening a conversation preselects whatever answered last, so "continue
  // with a different model" is a single change rather than a re-pick.
  const lastAnswer = [...(active?.messages ?? [])]
    .reverse()
    .find((message) => message.providerId !== null && message.model !== null)
  const allowance = keys.length > 0 ? null : await demoRemaining(userId)

  return (
    <ChatClient
      // Remounts when the conversation changes. Without it React keeps the same
      // instance across the navigation, and the message list — seeded once by a
      // lazy initialiser — keeps showing the previous chat.
      key={active?.summary.id ?? 'new'}
      conversations={conversations.items.map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updatedAt.toISOString(),
      }))}
      nextCursor={conversations.nextCursor}
      activeId={active?.summary.id ?? null}
      models={await modelCatalogue()}
      initialModel={
        lastAnswer === undefined ? 'auto' : `${lastAnswer.providerId}:${lastAnswer.model}`
      }
      initialMessages={(active?.messages ?? []).map((message) => ({
        role: message.role,
        content: message.content,
        provider: message.providerId,
        model: message.model,
      }))}
      usingOwnKeys={keys.length > 0}
      demoRemaining={allowance?.remaining ?? null}
      demoLimit={allowance?.limit ?? null}
    />
  )
}
