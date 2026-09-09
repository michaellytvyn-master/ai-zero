import { lookup } from 'node:dns/promises'
import { readableText, titleOf } from './html-text'
import { UnsafeUrlError, isPublicAddress, parseFetchableUrl } from './safe-address'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 4
const TIMEOUT_MS = 12_000

/** Identifies the fetcher, so a site can block it if it wants to. */
const USER_AGENT = 'ZeroCostAI/0.1 (+reader; on behalf of a signed-in user)'

export interface FetchedPage {
  readonly url: string
  readonly title: string
  readonly text: string
  readonly truncated: boolean
  readonly originalLength: number
}

export class PageFetchError extends Error {}

/**
 * Every hop is re-checked, not just the first. A redirect is the obvious way
 * past a check applied only to the address the user typed: a public host can
 * answer 302 and point at 169.254.169.254.
 */
async function assertPublicHost(url: URL): Promise<void> {
  const addresses = await lookup(url.hostname, { all: true }).catch(() => {
    throw new UnsafeUrlError('That host could not be resolved.')
  })
  if (addresses.length === 0) throw new UnsafeUrlError('That host could not be resolved.')
  for (const { address } of addresses) {
    if (!isPublicAddress(address)) {
      throw new UnsafeUrlError('That address is not on the public internet.')
    }
  }
}

export async function fetchPage(candidate: string, maxChars: number): Promise<FetchedPage> {
  let url = parseFetchableUrl(candidate)
  const timeout = AbortSignal.timeout(TIMEOUT_MS)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(url)

    const response = await fetch(url, {
      redirect: 'manual',
      signal: timeout,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain;q=0.9' },
    }).catch(() => {
      throw new PageFetchError('That page could not be reached.')
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (location === null) throw new PageFetchError('That page redirected nowhere.')
      url = parseFetchableUrl(new URL(location, url).toString())
      continue
    }

    if (!response.ok) throw new PageFetchError(`That page answered ${response.status}.`)

    const type = response.headers.get('content-type') ?? ''
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
      throw new PageFetchError('That address is not a readable page.')
    }

    const html = await readCapped(response)
    const text = /html|xhtml/i.test(type) ? readableText(html) : html.trim()
    return {
      url: url.toString(),
      title: /html|xhtml/i.test(type) ? titleOf(html) : '',
      text: text.slice(0, maxChars),
      truncated: text.length > maxChars,
      originalLength: text.length,
    }
  }

  throw new PageFetchError('That page redirected too many times.')
}

/** Stops reading at the cap rather than buffering whatever the server sends. */
async function readCapped(response: Response): Promise<string> {
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let out = ''
  let size = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) {
        out += decoder.decode(value, { stream: false })
        break
      }
      out += decoder.decode(value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return out
}

/** Every distinct http(s) address in a message, in the order written. */
export function extractUrls(text: string, limit = 3): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []
  const cleaned = found.map((url) => url.replace(/[.,;:!?]+$/, ''))
  return [...new Set(cleaned)].slice(0, limit)
}
