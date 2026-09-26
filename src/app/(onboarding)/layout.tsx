import { requireUser } from '@/lib/supabase/server'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-card md:my-10 md:min-h-[760px] md:rounded-hero md:border md:border-line">
      {children}
    </main>
  )
}
