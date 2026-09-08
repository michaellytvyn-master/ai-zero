const ASK_AI = 'zca-ask-ai'

/**
 * Giving every tab its own panel path is what makes Chrome instantiate a
 * separate side panel document per tab. Without a distinct path they share one
 * document, and one chat follows the user from tab to tab.
 */
function panelPathFor(tabId: number): string {
  return `sidepanel.html?tabId=${tabId}`
}

async function bindPanel(tabId: number, url: string | undefined): Promise<void> {
  // Browser-internal pages cannot host a panel usefully, and Chrome errors on
  // some of them, so they are left without one.
  if (url !== undefined && /^(chrome|edge|about|devtools):/.test(url)) {
    await chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => undefined)
    return
  }
  await chrome.sidePanel
    .setOptions({ tabId, path: panelPathFor(tabId), enabled: true })
    .catch(() => undefined)
}

/**
 * The panel opens only on the tab the user opened it on, and stays there.
 * Chrome would otherwise show it on every tab, so the global default is off and
 * tabs are enabled one at a time.
 *
 * Nothing here may be awaited before `open`. Chrome only accepts that call
 * while the user gesture is still on the stack, and a single `await` — even on
 * `setOptions` — is enough to lose it and fail with "may only be called in
 * response to a user gesture". The calls are ordered by Chrome, so enabling the
 * tab immediately before opening it is safe without awaiting.
 */
function openOnTab(tabId: number, windowId: number, url: string | undefined): void {
  if (url !== undefined && /^(chrome|edge|about|devtools):/.test(url)) return

  void chrome.sidePanel
    .setOptions({ tabId, path: panelPathFor(tabId), enabled: true })
    .catch(() => undefined)
  void chrome.sidePanel.open({ tabId, windowId }).catch(() => undefined)
  void markActive(tabId, true)
}

/** The badge is how a tab shows it has the panel attached. */
async function markActive(tabId: number, active: boolean): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: active ? '●' : '' }).catch(() => undefined)
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#2f5bd7' }).catch(() => undefined)
  await chrome.action
    .setTitle({ tabId, title: active ? 'Zero-Cost AI is open on this tab' : 'Open Zero-Cost AI' })
    .catch(() => undefined)
}

async function resetPanels(): Promise<void> {
  // Handling the click ourselves is what allows enabling one tab at a time;
  // openPanelOnActionClick would open the global panel on every tab.
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined)
  await chrome.sidePanel.setOptions({ enabled: false }).catch(() => undefined)
}

chrome.runtime.onInstalled.addListener(() => {
  void resetPanels()
  chrome.contextMenus.create({ id: ASK_AI, title: 'Ask AI about "%s"', contexts: ['selection'] })
})

chrome.runtime.onStartup.addListener(() => void resetPanels())

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined || tab.windowId === undefined) return
  openOnTab(tab.id, tab.windowId, tab.url)
})

// Navigating keeps the panel on its tab; only the path is re-asserted.
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url === undefined) return
  void chrome.action.getBadgeText({ tabId }).then((badge) => {
    if (badge.length > 0) void bindPanel(tabId, tab.url)
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id
  const windowId = tab?.windowId
  if (info.menuItemId !== ASK_AI || tabId === undefined || windowId === undefined) return

  // Stored without awaiting, so the gesture survives to reach `open`. The panel
  // takes far longer to load than this write takes to land.
  void chrome.storage.session.set({ [`quote:${tabId}`]: info.selectionText ?? '' })
  openOnTab(tabId, windowId, tab?.url)
})

// The tab comes with the event, so no lookup is needed — and a lookup would
// have to be awaited, which would lose the gesture.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'open-panel' || tab?.id === undefined || tab.windowId === undefined) return
  openOnTab(tab.id, tab.windowId, tab.url)
})

/** A closed tab's chat binding is dead weight; the conversation itself stays. */
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove([`tab:${tabId}`, `quote:${tabId}`])
})

/** Lets the panel turn itself off for its own tab. */
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const request = message as { type?: string; tabId?: number } | null
  const tabId = request?.tabId
  if (request?.type !== 'close-panel' || typeof tabId !== 'number') return false
  void (async () => {
    await chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => undefined)
    await markActive(tabId, false)
    sendResponse({ ok: true })
  })()
  return true
})

/**
 * Extraction targets the tab the asking panel belongs to, not whichever tab is
 * active, so a panel can never read a page other than its own.
 */
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const request = message as {
    type?: string
    mode?: string
    maxChars?: number
    tabId?: number
  } | null
  if (request?.type !== 'extract-page') return false

  void (async () => {
    try {
      const tabId = request.tabId
      if (typeof tabId !== 'number') {
        sendResponse({ ok: false, error: 'This panel is not attached to a tab.' })
        return
      }

      const tab = await chrome.tabs.get(tabId)
      if (/^(chrome|edge|about|devtools|chrome-extension):/.test(tab.url ?? '')) {
        sendResponse({ ok: false, error: 'Browser pages cannot be read by extensions.' })
        return
      }

      const wantsHtml = request.mode === 'html'
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: extract,
        args: [wantsHtml],
      })

      const page = result?.result as { title: string; url: string; content: string } | undefined
      if (page === undefined) {
        sendResponse({ ok: false, error: 'Could not read that page.' })
        return
      }

      const limit = Math.max(500, request.maxChars ?? 12_000)
      sendResponse({
        ok: true,
        page: {
          title: page.title,
          url: page.url,
          mode: wantsHtml ? 'html' : 'text',
          content: page.content.slice(0, limit),
          truncated: page.content.length > limit,
          originalLength: page.content.length,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      sendResponse({
        ok: false,
        error: /permission|host|access/i.test(message)
          ? 'This site has not been allowed yet. Switch page reading off and on again to grant it.'
          : message || 'Could not read that page.',
      })
    }
  })()

  return true
})

/** Serialised into the page, so it may not close over anything out here. */
function extract(wantsHtml: boolean): { title: string; url: string; content: string } {
  const base = { title: document.title, url: location.href }

  if (!wantsHtml) {
    const text = (document.body?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim()
    return { ...base, content: text }
  }

  const clone = document.documentElement.cloneNode(true) as HTMLElement
  // Scripts, styles and inlined data are most of the bytes and none of the
  // meaning, and they crowd out the markup the user actually asked about.
  for (const node of clone.querySelectorAll('script,style,noscript,template,svg,iframe')) {
    node.remove()
  }
  for (const node of clone.querySelectorAll('[src^="data:"],[href^="data:"]')) {
    node.removeAttribute('src')
    node.removeAttribute('href')
  }

  return {
    ...base,
    content: clone.outerHTML
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .trim(),
  }
}
