import { PageFetchError, extractUrls, fetchPage } from './fetch-page'
import { UnsafeUrlError } from './safe-address'

/** groq/compound runs the search itself, server-side, and reports what it read. */
export const SEARCH_MODEL = 'groq:groq/compound'

/** Split across however many links were pasted, so three do not blow the window. */
const TOTAL_BUDGET = 24_000

export interface ReadPage {
  readonly url: string
  readonly title: string
  readonly ok: boolean
  readonly note: string
}

export interface WebContext {
  readonly message: string | null
  readonly pages: ReadPage[]
}

/**
 * Reads whatever the user linked to and turns it into one message for the
 * model. Failures are reported inside that message rather than thrown, because
 * a dead link in a question is not a reason to refuse the question.
 */
export async function readLinkedPages(content: string): Promise<WebContext> {
  const urls = extractUrls(content)
  if (urls.length === 0) return { message: null, pages: [] }

  const budget = Math.floor(TOTAL_BUDGET / urls.length)
  const pages: ReadPage[] = []
  const blocks: string[] = []

  for (const url of urls) {
    try {
      const page = await fetchPage(url, budget)
      pages.push({
        url: page.url,
        title: page.title,
        ok: true,
        note: page.truncated
          ? `${page.text.length} of ${page.originalLength} characters`
          : `${page.text.length} characters`,
      })
      blocks.push(
        [
          `Page: ${page.title || page.url}`,
          `URL: ${page.url}`,
          '',
          '"""',
          page.text,
          '"""',
          page.truncated ? '(Truncated.)' : '',
        ]
          .join('\n')
          .trim(),
      )
    } catch (error) {
      const note =
        error instanceof UnsafeUrlError || error instanceof PageFetchError
          ? error.message
          : 'Could not be read.'
      pages.push({ url, title: '', ok: false, note })
      blocks.push(`Page: ${url}\nCould not be read: ${note}`)
    }
  }

  return {
    pages,
    message: [
      'The user linked to the pages below. Answer using what they contain, and say so if a',
      'page could not be read rather than inventing its contents.',
      '',
      blocks.join('\n\n'),
    ].join('\n'),
  }
}
