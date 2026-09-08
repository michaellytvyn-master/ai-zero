import { MAX_PAGE_CONTEXT_CHARS } from './lib/config'

const ASK_AI = 'zca-ask-ai'

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)
  chrome.contextMenus.create({
    id: ASK_AI,
    title: 'Ask AI about "%s"',
    contexts: ['selection'],
  })
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
 * Page extraction runs here rather than in the panel because the activeTab
 * grant lands on the extension when the user invokes it, and the service
 * worker is where scripting.executeScript can spend it. That keeps the
 * manifest free of a broad host permission.
 */
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if ((message as { type?: string } | null)?.type !== 'extract-page') return false

  void (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id === undefined) {
        sendResponse({ ok: false, error: 'no active tab' })
        return
      }

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          title: document.title,
          url: location.href,
          text: (document.body?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim(),
        }),
      })

      const page = result?.result as { title: string; url: string; text: string } | undefined
      if (page === undefined) {
        sendResponse({ ok: false, error: 'could not read the page' })
        return
      }

      const truncated = page.text.length > MAX_PAGE_CONTEXT_CHARS
      sendResponse({
        ok: true,
        page: {
          title: page.title,
          url: page.url,
          text: page.text.slice(0, MAX_PAGE_CONTEXT_CHARS),
          truncated,
          originalLength: page.text.length,
        },
      })
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  })()

  return true
})
