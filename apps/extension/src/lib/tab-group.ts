/**
 * Marks the tabs this panel is open on with a named group in the tab strip.
 * The toolbar badge only shows for the tab in front; a group is visible for
 * every one of them at once, and names itself.
 */
const TITLE = 'Zero-Cost AI'
const COLOR: chrome.tabGroups.ColorEnum = 'blue'
const PREFERENCE = 'groupTabs'

/** One group per window, so several attached tabs sit together rather than apart. */
const groupKey = (windowId: number): string => `group:${windowId}`

export async function groupingEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(PREFERENCE)
  return (stored[PREFERENCE] as boolean | undefined) ?? true
}

export async function setGroupingEnabled(on: boolean): Promise<void> {
  await chrome.storage.local.set({ [PREFERENCE]: on })
}

export async function attachTabToGroup(tabId: number, windowId: number): Promise<void> {
  if (!(await groupingEnabled())) return

  const stored = await chrome.storage.session.get(groupKey(windowId))
  const existing = stored[groupKey(windowId)] as number | undefined

  // Reusing a group the user has since closed throws, so a failure here just
  // means starting a fresh one rather than giving up on grouping.
  const groupId =
    existing === undefined
      ? null
      : await chrome.tabs.group({ tabIds: [tabId], groupId: existing }).catch(() => null)

  const finalId =
    groupId ??
    (await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } }).catch(() => null))

  if (finalId === null) return

  await chrome.storage.session.set({ [groupKey(windowId)]: finalId })
  await chrome.tabGroups.update(finalId, { title: TITLE, color: COLOR }).catch(() => undefined)
}

/** Chrome deletes a group once its last tab leaves, so nothing else is needed. */
export async function detachTabFromGroup(tabId: number): Promise<void> {
  await chrome.tabs.ungroup(tabId).catch(() => undefined)
}
