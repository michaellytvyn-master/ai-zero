export interface PageContext {
  readonly title: string
  readonly url: string
  readonly text: string
  readonly truncated: boolean
  readonly originalLength: number
}

export async function readActivePage(): Promise<PageContext> {
  const response = (await chrome.runtime.sendMessage({ type: 'extract-page' })) as
    | { ok: true; page: PageContext }
    | { ok: false; error: string }

  if (!response.ok) throw new Error(response.error)
  return response.page
}

export function asQuotedContext(page: PageContext): string {
  const note = page.truncated
    ? `\n\n[truncated: showing the first ${page.text.length} of ${page.originalLength} characters]`
    : ''
  return `Page: ${page.title}\n${page.url}\n\n"""\n${page.text}\n"""${note}`
}
