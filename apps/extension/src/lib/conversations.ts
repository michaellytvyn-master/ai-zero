import { SITE_URL } from './config'
import type { Session } from './session'

export interface StoredTurn {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
  readonly providerId: string | null
  readonly model: string | null
}

const headers = (session: Session): HeadersInit => ({
  authorization: `Bearer ${session.token}`,
  'content-type': 'application/json',
})

export async function createConversation(session: Session, firstMessage: string): Promise<string> {
  const response = await fetch(`${SITE_URL}/api/conversations`, {
    method: 'POST',
    headers: headers(session),
    body: JSON.stringify({ firstMessage }),
  })
  if (!response.ok) throw new Error('Could not start a conversation.')
  return (await response.json()).id as string
}

/** null when the conversation is gone, so the tab can start a fresh one. */
export async function loadConversation(
  session: Session,
  id: string,
): Promise<{ title: string; messages: StoredTurn[] } | null> {
  const response = await fetch(`${SITE_URL}/api/conversations/${id}`, {
    headers: { authorization: `Bearer ${session.token}` },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Could not load that conversation.')
  return (await response.json()) as { title: string; messages: StoredTurn[] }
}

/**
 * Best effort. In direct mode the answer is already on screen, so failing to
 * archive it must not look like the request itself failed.
 */
export async function appendMessage(
  session: Session,
  id: string,
  message: { role: 'user' | 'assistant'; content: string; providerId?: string; model?: string },
): Promise<void> {
  await fetch(`${SITE_URL}/api/conversations/${id}/messages`, {
    method: 'POST',
    headers: headers(session),
    body: JSON.stringify(message),
  }).catch(() => undefined)
}
