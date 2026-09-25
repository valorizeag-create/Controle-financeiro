import { requireUser, createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/features/shell/bottom-nav'
import { Sidebar } from '@/features/shell/sidebar'
import { Toast } from '@/features/shell/toast'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('display_name').single()
  return (
    <div className="flex min-h-dvh">
      <Sidebar displayName={profile?.display_name ?? ''} />
      <div className="flex-1 pb-28 md:pb-10">{children}</div>
      <BottomNav />
      <Toast />
    </div>
  )
}
