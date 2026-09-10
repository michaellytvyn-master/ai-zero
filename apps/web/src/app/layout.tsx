import type { Metadata, Viewport } from 'next'
import { safeAuth } from '@/auth'
import SiteNav from '@/components/site-nav'
import { SITE_DESCRIPTION, SITE_NAME, siteOrigin, siteUrl } from '@/lib/site'
import './globals.css'

export const metadata: Metadata = {
  // Makes every relative canonical, Open Graph and sitemap URL absolute.
  metadataBase: new URL(siteOrigin()),
  title: {
    default: `${SITE_NAME} — your own free AI keys, one interface`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'free AI chat',
    'bring your own key',
    'BYOK AI',
    'Groq',
    'Cloudflare Workers AI',
    'OpenAI-compatible API',
    'LLM router',
    'AI failover',
  ],
  authors: [{ name: 'Michael Lytvyn' }],
  creator: 'Michael Lytvyn',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — your own free AI keys, one interface`,
    description: SITE_DESCRIPTION,
    url: siteUrl('/'),
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — your own free AI keys, one interface`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  formatDetection: { telephone: false, address: false, email: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07080a',
  // The design is committed to dark; saying so stops the first paint flashing.
  colorScheme: 'dark',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await safeAuth()
  const email = session?.user?.email ?? null

  return (
    <html lang="en">
      <body>
        <SiteNav email={email} />
        {children}
      </body>
    </html>
  )
}
