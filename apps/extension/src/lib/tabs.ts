import { DEFAULT_RESPONSE_MODE, type ResponseMode } from '@zca/shared'
import type { PageMode } from './page-context'

export interface TabChat {
  /** Which stored conversation this tab is talking in, if it has started one. */
  readonly conversationId: string | null
  readonly draft: string
  readonly model: string
  readonly pageMode: PageMode
  readonly responseMode: ResponseMode
  readonly searchWeb: boolean
  /** Acting on the page rather than answering about it. Off by default. */
  readonly act: boolean
  /**
   * A reply still arriving when the panel was torn down. Chrome destroys the
   * document as soon as the user leaves the tab, and the answer only reaches
   * the database once it is complete, so it is kept here as it streams.
   */
  readonly pendingAnswer: string | null
  readonly pendingAnsweredBy: string | null
}

export const EMPTY_TAB_CHAT: TabChat = {
  conversationId: null,
  draft: '',
  model: 'auto',
  // On by default: the panel is opened from a page, so the page is usually
  // what the question is about. Falls back to off if access was never granted.
  pageMode: 'text',
  responseMode: DEFAULT_RESPONSE_MODE,
  searchWeb: false,
  act: false,
  pendingAnswer: null,
  pendingAnsweredBy: null,
}

export interface OwnTab {
  readonly id: number
  readonly windowId: number
  readonly title: string
  readonly url: string
}

/**
 * The background worker gives each tab its own panel path, so a panel knows
 * which tab it belongs to from its own URL. It never asks which tab is active:
 * a panel must not follow the user to a different page.
 */
export function panelTabId(search: string = location.search): number | null {
  const raw = new URLSearchParams(search).get('tabId')
  // Strict, because parseInt would happily read "1.5" as 1 and "12x" as 12,
  // and a panel pointed at the wrong tab reads the wrong page.
  if (raw === null || !/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export async function ownTab(tabId: number): Promise<OwnTab | null> {
  try {
    const tab = await chrome.tabs.get(tabId)
    return {
      id: tabId,
      windowId: tab.windowId,
      title: tab.title ?? '',
      url: tab.url ?? '',
    }
  } catch {
    return null
  }
}

/** Fires when this panel's own tab navigates or retitles, and nothing else. */
export function onOwnTabChanged(tabId: number, listener: (tab: OwnTab) => void): () => void {
  const onUpdated = (updatedId: number, change: chrome.tabs.TabChangeInfo) => {
    if (updatedId !== tabId) return
    if (change.title === undefined && change.url === undefined) return
    void ownTab(tabId).then((tab) => {
      if (tab !== null) listener(tab)
    })
  }

  chrome.tabs.onUpdated.addListener(onUpdated)
  return () => chrome.tabs.onUpdated.removeListener(onUpdated)
}

const key = (tabId: number): string => `tab:${tabId}`

/**
 * Session storage rather than local: tab ids are only meaningful while the
 * browser is running, so a binding that outlived a restart would attach an old
 * conversation to an unrelated new tab.
 */
export async function readTabChat(tabId: number): Promise<TabChat> {
  const stored = await chrome.storage.session.get(key(tabId))
  return { ...EMPTY_TAB_CHAT, ...((stored[key(tabId)] as Partial<TabChat> | undefined) ?? {}) }
}

export async function writeTabChat(tabId: number, patch: Partial<TabChat>): Promise<void> {
  const current = await readTabChat(tabId)
  await chrome.storage.session.set({ [key(tabId)]: { ...current, ...patch } })
}

/** Text the context menu captured for this tab before opening the panel. */
export async function takePendingQuote(tabId: number): Promise<string | null> {
  const stored = await chrome.storage.session.get(`quote:${tabId}`)
  const quote = stored[`quote:${tabId}`] as string | undefined
  if (quote === undefined || quote.length === 0) return null
  await chrome.storage.session.remove(`quote:${tabId}`)
  return quote
}

/**
 * Written straight to storage rather than through readTabChat, because this
 * runs on every few chunks of a stream and must not read the whole record back
 * each time.
 */
export async function savePendingAnswer(
  tabId: number,
  answer: string,
  answeredBy: string | null,
): Promise<void> {
  const stored = await chrome.storage.session.get(`tab:${tabId}`)
  const current = (stored[`tab:${tabId}`] as TabChat | undefined) ?? EMPTY_TAB_CHAT
  await chrome.storage.session.set({
    [`tab:${tabId}`]: { ...current, pendingAnswer: answer, pendingAnsweredBy: answeredBy },
  })
}
