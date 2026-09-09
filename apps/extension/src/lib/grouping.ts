/**
 * The worker owns every tab manipulation, so the panel asks rather than acting.
 * That also keeps the grouping module out of a chunk shared between a service
 * worker and a page, which is a fragile thing to depend on.
 */
export async function readGrouping(): Promise<boolean> {
  const response = (await chrome.runtime
    .sendMessage({ type: 'grouping-state' })
    .catch(() => null)) as { on?: boolean } | null
  return response?.on ?? true
}

export async function writeGrouping(
  on: boolean,
  tab: { id: number; windowId: number } | null,
): Promise<void> {
  await chrome.runtime
    .sendMessage({ type: 'set-grouping', on, tabId: tab?.id, windowId: tab?.windowId })
    .catch(() => undefined)
}
