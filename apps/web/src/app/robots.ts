import type { MetadataRoute } from 'next'
import { PRIVATE_ROUTES, siteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: PRIVATE_ROUTES.map((route) => `${route}/`),
    },
    sitemap: siteUrl('/sitemap.xml'),
    host: siteUrl('/'),
  }
}
