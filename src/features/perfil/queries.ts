import 'server-only'
import { cache } from 'react'
import { createClient, requireUser } from '@/lib/supabase/server'

export type ProfileDetails = {
  displayName: string
  email: string
  initialBalanceCents: number
  onboardedAt: string | null
  categoriesCount: number
}

// Memoiza por requisição: o layout (gate de onboarding) e a página lidas no
// mesmo request reaproveitam a mesma consulta em vez de bater no Supabase de
// novo a cada uma.
const selectProfileRow = cache(async () => {
  const supabase = await createClient()
  return supabase.from('profiles').select('display_name, initial_balance_cents, onboarded_at').single()
})

export async function loadProfile(): Promise<ProfileDetails> {
  const user = await requireUser()
  const supabase = await createClient()
  const [profile, categories] = await Promise.all([
    selectProfileRow(),
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

// Leitura leniente para o gate do layout (app): falha ou ausência de perfil
// não redireciona, para não prender a pessoa num vai e vem entre /inicio e
// /boas-vindas.
export const getOnboardedAt = cache(async (): Promise<{ display_name: string; onboarded_at: string | null } | null> => {
  const { data, error } = await selectProfileRow()
  if (error) return null
  return { display_name: data.display_name, onboarded_at: data.onboarded_at }
})
