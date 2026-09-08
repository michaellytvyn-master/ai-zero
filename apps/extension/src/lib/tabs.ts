import type { PageMode } from './page-context'

export interface TabChat {
  /** Which stored conversation this tab is talking in, if it has started one. */
  readonly conversationId: string | null
  readonly draft: string
  readonly model: string
  readonly pageMode: PageMode
}

export const EMPTY_TAB_CHAT: TabChat = {
  conversationId: null,
  draft: '',
  model: 'auto',
  pageMode: 'off',
}

export interface OwnTab {
  readonly id: number
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
    return { id: tabId, title: tab.title ?? '', url: tab.url ?? '' }
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
