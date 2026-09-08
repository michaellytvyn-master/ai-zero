/** Set VITE_SITE_URL at build time; host_permissions in the manifest must match. */
export const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'http://localhost:3000'

/** DECISIONS.md section 6: our downtime must not break somebody's own BYOK. */
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000

export const MAX_PAGE_CONTEXT_CHARS = 12_000
