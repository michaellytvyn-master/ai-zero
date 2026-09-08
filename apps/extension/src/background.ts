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

async function bindEveryTab(): Promise<void> {
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id !== undefined) await bindPanel(tab.id, tab.url)
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)
  chrome.contextMenus.create({ id: ASK_AI, title: 'Ask AI about "%s"', contexts: ['selection'] })
  void bindEveryTab()
})

chrome.runtime.onStartup.addListener(() => void bindEveryTab())

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined) void bindPanel(tab.id, tab.url)
})

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url !== undefined || change.status === 'loading') void bindPanel(tabId, tab.url)
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id
  const windowId = tab?.windowId
  if (info.menuItemId !== ASK_AI || tabId === undefined || windowId === undefined) return
  void (async () => {
    await chrome.storage.session.set({ [`quote:${tabId}`]: info.selectionText ?? '' })
    await chrome.sidePanel.open({ tabId, windowId })
  })()
})

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-panel') return
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id !== undefined && tab.windowId !== undefined) {
      await chrome.sidePanel.open({ tabId: tab.id, windowId: tab.windowId })
    }
  })()
})

/** A closed tab's chat binding is dead weight; the conversation itself stays. */
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove([`tab:${tabId}`, `quote:${tabId}`])
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
