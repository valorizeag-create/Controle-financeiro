import type { Metadata } from 'next'
import { termsDoc } from '@/features/legal/content'
import { CONTROLLER, isLegalReady, LEGAL_UPDATED_ON } from '@/features/legal/controller'
import { LegalPage } from '@/features/legal/legal-page'

export const metadata: Metadata = { title: 'Termos de uso — Íris', robots: { index: isLegalReady(CONTROLLER) } }

export default function TermosPage() {
  return <LegalPage doc={termsDoc(CONTROLLER)} controller={CONTROLLER} updatedOn={LEGAL_UPDATED_ON} />
}
