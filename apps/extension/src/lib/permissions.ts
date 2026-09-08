/**
 * Access to page contents is asked for one site at a time, when the user turns
 * page reading on. The extension ships with no access to any site, so a
 * granted origin is something the user chose, and Chrome remembers it.
 */
export function originPatternFor(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return `${parsed.protocol}//${parsed.hostname}/*`
}

export function describeSite(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'this page'
  }
}

export async function hasPageAccess(url: string): Promise<boolean> {
  const origins = originPatternFor(url)
  if (origins === null) return false
  return chrome.permissions.contains({ origins: [origins] })
}

/**
 * Called straight from the click that flips the control on: Chrome only shows
 * the prompt inside a user gesture, and awaiting anything first loses it. When
 * the origin is already granted this resolves true without prompting.
 */
export function requestPageAccess(url: string): Promise<boolean> {
  const origins = originPatternFor(url)
  if (origins === null) return Promise.resolve(false)
  return chrome.permissions.request({ origins: [origins] })
}

export async function grantedOrigins(): Promise<string[]> {
  const all = await chrome.permissions.getAll()
  return (all.origins ?? []).filter(
    (origin) => !origin.includes('api.') && !origin.includes('localhost'),
  )
}
