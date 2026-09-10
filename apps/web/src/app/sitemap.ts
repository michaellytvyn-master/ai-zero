import type { MetadataRoute } from 'next'
import { PUBLIC_ROUTES, siteUrl } from '@/lib/site'

/** Only the pages a signed-out visitor can actually reach. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return PUBLIC_ROUTES.map((route) => ({
    url: siteUrl(route),
    lastModified: now,
    changeFrequency: route === '/' ? ('weekly' as const) : ('monthly' as const),
    priority: route === '/' ? 1 : 0.5,
  }))
}
