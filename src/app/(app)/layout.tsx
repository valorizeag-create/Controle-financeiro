import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/server'
import { needsOnboarding } from '@/features/onboarding/gate'
import { getOnboardedAt } from '@/features/perfil/queries'
import { PushSync } from '@/features/notificacoes/push-sync'
import { BottomNav } from '@/features/shell/bottom-nav'
import { MainFrame } from '@/features/shell/main-frame'
import { Sidebar } from '@/features/shell/sidebar'
import { Toast } from '@/features/shell/toast'
import { SkipLink } from '@/ui/skip-link'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const profile = await getOnboardedAt()
  // Cadastro novo (e-mail ou Google) e quem parou no meio do onboarding vão para as boas-vindas.
  if (needsOnboarding(profile)) redirect('/boas-vindas')
  return (
    <div className="flex min-h-dvh">
      <SkipLink />
      <Sidebar displayName={profile?.display_name ?? ''} />
      <MainFrame>{children}</MainFrame>
      <BottomNav />
      <Toast />
      <PushSync />
    </div>
  )
}
