import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { env } from '@/lib/env'
import { SEO_DESCRIPTION, SEO_TITLE } from '@/features/landing/seo'
import { OfflineBanner } from '@/features/shell/offline-banner'
import { RegisterServiceWorker } from '@/features/pwa/register-sw'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: SEO_TITLE,
  description: SEO_DESCRIPTION,
  appleWebApp: { capable: true, title: 'Íris', statusBarStyle: 'default' },
}

export const viewport: Viewport = { themeColor: '#f8f8f8', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={geist.variable}>
      <body>
        <OfflineBanner />
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  )
}
