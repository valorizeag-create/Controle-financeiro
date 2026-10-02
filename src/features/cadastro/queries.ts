import 'server-only'
import { deletionNotice, familyShareCents, type DeletionNotice } from '@/domain/account'
import { loadFamilyGoals, loadMyFamily } from '@/features/familia/queries'
import { fetchGoalMovements } from '@/features/metas/queries'
import { createClient, requireUser } from '@/lib/supabase/server'
import { isSessionRecent } from './reauth'

export async function loadSignIn(): Promise<{ hasPassword: boolean; pendingEmail: string | null; sessionRecent: boolean }> {
  const supabase = await createClient()
  const [{ data }, sessionRecent] = await Promise.all([supabase.auth.getUser(), isSessionRecent(supabase)])
  const user = data.user
  const providers = user?.app_metadata?.providers
  return {
    hasPassword: Array.isArray(providers) && providers.includes('email'),
    pendingEmail: user?.new_email ?? null,
    sessionRecent,
  }
}

export async function loadDeletionContext(): Promise<{
  notice: DeletionNotice
  shareCents: number
  passesAdmin: boolean
  sessionRecent: boolean
}> {
  const user = await requireUser()
  const supabase = await createClient()
  const family = await loadMyFamily()
  const familyId = family?.id ?? null

  // Só se pergunta se existe ao menos um registro confirmado da própria pessoa.
  const base = () => supabase.from('transactions').select('family_id').eq('user_id', user.id).eq('status', 'confirmed')
  const hasOne = async (scope: (q: ReturnType<typeof base>) => ReturnType<typeof base>): Promise<boolean> => {
    const { data, error } = await scope(base()).limit(1)
    if (error) throw error
    return (data ?? []).length > 0
  }
  // A4 B: só a parte da própria pessoa (os movimentos que ela mesma lê).
  const shareInGoals = async (id: string): Promise<number> => {
    const [goals, movements] = await Promise.all([loadFamilyGoals(id), fetchGoalMovements(supabase, user.id)])
    return familyShareCents(goals.map((g) => g.id), movements)
  }

  const [hasCurrentFamilyTx, hasOtherFamilyTx, shareCents, sessionRecent] = await Promise.all([
    familyId ? hasOne((q) => q.eq('family_id', familyId)) : false,
    hasOne((q) => (familyId ? q.not('family_id', 'is', null).neq('family_id', familyId) : q.not('family_id', 'is', null))),
    familyId ? shareInGoals(familyId) : 0,
    isSessionRecent(supabase),
  ])

  const activeMembers = family ? family.members.filter((m) => m.leftAt === null).length : 0
  return {
    notice: deletionNotice({ hasCurrentFamilyTx, hasOtherFamilyTx, activeMembers }),
    shareCents,
    passesAdmin: family?.role === 'admin' && activeMembers > 1,
    sessionRecent,
  }
}
