export type PageMode = 'off' | 'text' | 'html'

export interface PageContext {
  readonly title: string
  readonly url: string
  readonly mode: Exclude<PageMode, 'off'>
  readonly content: string
  readonly truncated: boolean
  readonly originalLength: number
}

export async function readActivePage(
  mode: Exclude<PageMode, 'off'>,
  maxChars: number,
): Promise<PageContext> {
  const response = (await chrome.runtime.sendMessage({
    type: 'extract-page',
    mode,
    maxChars,
  })) as { ok: true; page: PageContext } | { ok: false; error: string }

  if (!response.ok) throw new Error(response.error)
  return response.page
}

/**
 * Fenced, and labelled with where it came from, so the model treats it as
 * material to read rather than as instructions addressed to it.
 */
export function asContextMessage(page: PageContext): string {
  const fence = page.mode === 'html' ? '```html' : '```'
  const note = page.truncated
    ? `\n\n(Truncated: ${page.content.length} of ${page.originalLength} characters.)`
    : ''

  return [
    `The user is looking at this page. Answer questions about it using the content below.`,
    `Title: ${page.title}`,
    `URL: ${page.url}`,
    `Captured as: ${page.mode === 'html' ? 'HTML source' : 'readable text'}`,
    '',
    fence,
    page.content,
    '```',
    note,
  ]
    .join('\n')
    .trim()
}
