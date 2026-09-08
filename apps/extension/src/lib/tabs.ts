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

const key = (tabId: number): string => `tab:${tabId}`

export interface ActiveTab {
  readonly id: number
  readonly title: string
  readonly url: string
}

export async function currentTab(): Promise<ActiveTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id === undefined) return null
  return { id: tab.id, title: tab.title ?? '', url: tab.url ?? '' }
}

/**
 * Session storage rather than local: tab ids are only meaningful for as long as
 * the browser is running, so bindings that outlived a restart would attach old
 * conversations to unrelated new tabs.
 */
export async function readTabChat(tabId: number): Promise<TabChat> {
  const stored = await chrome.storage.session.get(key(tabId))
  return { ...EMPTY_TAB_CHAT, ...((stored[key(tabId)] as Partial<TabChat> | undefined) ?? {}) }
}

export async function writeTabChat(tabId: number, patch: Partial<TabChat>): Promise<void> {
  const current = await readTabChat(tabId)
  await chrome.storage.session.set({ [key(tabId)]: { ...current, ...patch } })
}

export async function forgetTab(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key(tabId))
}

/** Fires when the user switches tabs, or navigates the tab they are on. */
export function onActiveTabChanged(listener: (tab: ActiveTab) => void): () => void {
  const announce = () => {
    void currentTab().then((tab) => {
      if (tab !== null) listener(tab)
    })
  }

  const onActivated = () => announce()
  const onUpdated = (_id: number, change: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
    if (tab.active && (change.title !== undefined || change.url !== undefined)) announce()
  }

  chrome.tabs.onActivated.addListener(onActivated)
  chrome.tabs.onUpdated.addListener(onUpdated)
  chrome.windows.onFocusChanged.addListener(onActivated)

  return () => {
    chrome.tabs.onActivated.removeListener(onActivated)
    chrome.tabs.onUpdated.removeListener(onUpdated)
    chrome.windows.onFocusChanged.removeListener(onActivated)
  }
}
