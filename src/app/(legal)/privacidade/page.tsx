import type { Metadata } from 'next'
import { privacyDoc } from '@/features/legal/content'
import { CONTROLLER, isLegalReady, LEGAL_UPDATED_ON } from '@/features/legal/controller'
import { LegalPage } from '@/features/legal/legal-page'

export const metadata: Metadata = { title: 'Política de privacidade — Íris', robots: { index: isLegalReady(CONTROLLER) } }

export default function PrivacidadePage() {
  return <LegalPage doc={privacyDoc(CONTROLLER)} controller={CONTROLLER} updatedOn={LEGAL_UPDATED_ON} />
}
