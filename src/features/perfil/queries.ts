import 'server-only'
import { createClient, requireUser } from '@/lib/supabase/server'

export type ProfileDetails = {
  displayName: string
  email: string
  initialBalanceCents: number
  onboardedAt: string | null
  categoriesCount: number
}

export async function loadProfile(): Promise<ProfileDetails> {
  const user = await requireUser()
  const supabase = await createClient()
  const [profile, categories] = await Promise.all([
    supabase.from('profiles').select('display_name, initial_balance_cents, onboarded_at').single(),
    supabase.from('categories').select('id', { count: 'exact', head: true }),
  ])
  if (profile.error) throw profile.error
  if (categories.error) throw categories.error
  return {
    displayName: profile.data.display_name,
    email: user.email,
    initialBalanceCents: Number(profile.data.initial_balance_cents),
    onboardedAt: profile.data.onboarded_at,
    categoriesCount: categories.count ?? 0,
  }
}
