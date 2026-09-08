/**
 * Chrome grants page access by origin; there is no per-tab grant. Asking site
 * by site meant a prompt on every new domain, so this asks once for all sites
 * and never again. Nothing is granted at install — this is the moment the user
 * chooses, and it is triggered by them switching page reading on.
 */
export const ALL_SITES = ['http://*/*', 'https://*/*']

export function hasPageAccess(): Promise<boolean> {
  return chrome.permissions.contains({ origins: ALL_SITES })
}

/**
 * Called straight from the click that flips the control on: Chrome only shows
 * the prompt inside a user gesture, and awaiting anything first loses it. When
 * access is already granted this resolves true without prompting.
 */
export function requestPageAccess(): Promise<boolean> {
  return chrome.permissions.request({ origins: ALL_SITES })
}

export function revokePageAccess(): Promise<boolean> {
  return chrome.permissions.remove({ origins: ALL_SITES })
}

export function describeSite(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'this page'
  }
}

/** Pages no extension can read, whatever has been granted. */
export function isReadable(url: string): boolean {
  return /^https?:\/\//.test(url)
}
