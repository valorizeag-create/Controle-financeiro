import { redirect } from 'next/navigation'
import { loadProfile } from '@/features/perfil/queries'
import { OnboardingSlide, parseStep } from '@/features/onboarding/slide'

export default async function BoasVindasPage({ searchParams }: { searchParams: Promise<{ passo?: string }> }) {
  const [{ passo }, profile] = await Promise.all([searchParams, loadProfile()])
  if (profile.onboardedAt) redirect('/inicio')
  return <OnboardingSlide step={parseStep(passo)} />
}
