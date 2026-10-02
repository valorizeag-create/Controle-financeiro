import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { OfflineBanner } from '@/features/shell/offline-banner'
import { RegisterServiceWorker } from '@/features/pwa/register-sw'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'Íris — Veja para onde seu dinheiro vai',
  description: 'App gratuito de finanças pessoais. Anote seus gastos em segundos e entenda seu mês de um jeito simples, visual e sem planilha.',
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
