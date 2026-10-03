import type { Metadata } from 'next'
import { trustItems } from '@/features/landing/content'
import { LandingPage } from '@/features/landing/landing-page'
import { DATA_RIGHTS_RELEASED } from '@/features/landing/release'
import { SEO_DESCRIPTION, SEO_TITLE } from '@/features/landing/seo'
import { CONTROLLER, isLegalReady } from '@/features/legal/controller'

// Estática: nenhuma leitura de sessão. Quem já entrou nunca chega aqui (o proxy leva para /inicio).
export const dynamic = 'force-static'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { type: 'website', locale: 'pt_BR', siteName: 'Íris', url: '/', title: SEO_TITLE, description: SEO_DESCRIPTION },
}

export default function Home() {
  return <LandingPage trust={trustItems({ legalReady: isLegalReady(CONTROLLER), dataReleased: DATA_RIGHTS_RELEASED })} />
}
