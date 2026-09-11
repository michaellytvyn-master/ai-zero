import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { modelCatalogue } from '@/lib/model-catalogue'
import { safeAuth } from '@/auth'
import ChatClient from '@/components/chat-client'
import { TRIAL_HISTORY_MESSAGES, contentStoreFor } from '@/lib/content-store'
import type { ConversationPage, ConversationSummary, StoredMessage } from '@/lib/conversations'
import { UserDatabaseError } from '@/lib/user-database'
import { listProviderKeys, ownsModelKey } from '@/lib/provider-keys'
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
  const keys = await listProviderKeys(userId)

  // The history lives in the user's own database when they have connected one.
  // If it does not answer, the page still opens and says so; nothing falls
  // back to storing their chats here instead.
  let conversations: ConversationPage = { items: [], nextCursor: null }
  let active: { summary: ConversationSummary; messages: StoredMessage[] } | null = null
  let historyNotice: string | null = null
  try {
    const store = await contentStoreFor(userId)
    conversations = await store.list()
    active = c === undefined ? null : await store.load(c)
    if (store.kind === 'trial') {
      historyNotice = `Only your last ${TRIAL_HISTORY_MESSAGES} messages are kept. Connect your own database in Settings to keep everything.`
    }
  } catch (error) {
    if (!(error instanceof UserDatabaseError)) throw error
    historyNotice = error.userMessage
  }

  // Reopening a conversation preselects whatever answered last, so "continue
  // with a different model" is a single change rather than a re-pick.
  const lastAnswer = [...(active?.messages ?? [])]
    .reverse()
    .find((message) => message.providerId !== null && message.model !== null)
  const ownKeys = ownsModelKey(keys.map((key) => key.providerId))
  const allowance = ownKeys ? null : await demoRemaining(userId)

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
      usingOwnKeys={ownKeys}
      historyNotice={historyNotice}
      demoRemaining={allowance?.remaining ?? null}
      demoLimit={allowance?.limit ?? null}
    />
  )
}
