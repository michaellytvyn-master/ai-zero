import { SITE_URL } from './config'
import type { Session } from './session'

/** groq/compound searches server-side; nothing else free can. */
export const SEARCH_MODEL = 'groq:groq/compound'

export interface ReadPage {
  readonly url: string
  readonly title: string
  readonly ok: boolean
  readonly note: string
}

const LINK = /https?:\/\/[^\s<>"')\]]+/i

export function mentionsLink(text: string): boolean {
  return LINK.test(text)
}

export function canSearch(session: Session): boolean {
  return session.providers.some((provider) => provider.id === 'groq' && provider.key !== null)
}

/**
 * Pages are read by the site, not here. The checks that stop a link pointing at
 * a private address belong in one place, and duplicating them in the extension
 * would mean two chances to get them wrong.
 */
export async function readLinkedPages(
  session: Session,
  content: string,
): Promise<{ message: string | null; pages: ReadPage[] }> {
  if (!mentionsLink(content)) return { message: null, pages: [] }

  const response = await fetch(`${SITE_URL}/api/read-url`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  }).catch(() => null)

  if (response === null || !response.ok) return { message: null, pages: [] }
  return (await response.json()) as { message: string | null; pages: ReadPage[] }
}
