const ASK_AI = 'zca-ask-ai'

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)
  chrome.contextMenus.create({ id: ASK_AI, title: 'Ask AI about "%s"', contexts: ['selection'] })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== ASK_AI || tab?.windowId === undefined) return
  void (async () => {
    await chrome.storage.local.set({ pendingQuote: info.selectionText ?? '' })
    await chrome.sidePanel.open({ windowId: tab.windowId })
  })()
})

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-panel') return
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.windowId !== undefined) await chrome.sidePanel.open({ windowId: tab.windowId })
  })()
})

/**
 * Extraction runs here rather than in the panel because the activeTab grant
 * lands on the extension when the user invokes it, and the service worker is
 * where scripting.executeScript can spend it. That keeps a broad host
 * permission out of the manifest.
 */
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const request = message as { type?: string; mode?: string; maxChars?: number } | null
  if (request?.type !== 'extract-page') return false

  void (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id === undefined) {
        sendResponse({ ok: false, error: 'No active tab to read.' })
        return
      }
      if (/^(chrome|edge|about|devtools|chrome-extension):/.test(tab.url ?? '')) {
        sendResponse({ ok: false, error: 'Browser pages cannot be read by extensions.' })
        return
      }

      const wantsHtml = request.mode === 'html'
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
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
        error: /permission|host/i.test(message)
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

/** A closed tab's chat binding is dead weight; the conversation itself stays. */
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`tab:${tabId}`)
})
