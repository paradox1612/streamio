import type { Metadata } from 'next'
import { Manrope, Space_Grotesk } from 'next/font/google'
import './globals.css'
import Providers from '@/components/Providers'

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' })

export const metadata: Metadata = {
  title: 'StreamBridge | IPTV for Stremio With One Private Addon',
  description:
    'Connect your IPTV provider to Stremio with one private addon link. StreamBridge handles provider checks, metadata repair, and failover — no manual config.',
  metadataBase: new URL('https://streambridge.thekush.dev'),
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: 'StreamBridge',
    title: 'StreamBridge | IPTV for Stremio With One Private Addon',
    description:
      'Connect your IPTV provider to Stremio with one private addon link.',
    url: 'https://streambridge.thekush.dev/',
    images: [{ url: '/og-image.svg' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StreamBridge | IPTV for Stremio With One Private Addon',
    description:
      'Connect your IPTV provider to Stremio with one private addon link.',
    images: ['/og-image.svg'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${spaceGrotesk.variable} h-full antialiased`}
      style={{ fontFamily: 'var(--font-manrope), -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
