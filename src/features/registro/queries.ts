import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, requireUser } from '@/lib/supabase/server'
import { fetchAllPages } from './paging'
import { personalLedger } from '@/domain/family'
import { orderCategories } from '@/features/categorias/names'
import { ensureOccurrences } from '@/features/contas/occurrences'
import { fetchGoalMovements } from '@/features/metas/queries'
import type { GoalMovementRow } from '@/features/metas/types'
import { TX_COLUMNS, toTxRow, type TxRawRow, type TxRow } from './tx-row'

export type { TxRow } from './tx-row'

export type Profile = { displayName: string; initialBalanceCents: number }
export type Category = { id: string; name: string; defaultKey: string | null }

async function fetchCategories(supabase: SupabaseClient, userId: string): Promise<Category[]> {
  // O `.order('sort_order')` aqui é só para a página vir com uma ordem razoável;
  // orderCategories() abaixo é quem decide a ordem final (Outros sempre por último).
  const { data, error } = await supabase.from('categories').select('id, name, default_key, sort_order').eq('user_id', userId).order('sort_order')
  if (error) throw error
  const rows = data.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    defaultKey: c.default_key as string | null,
    sortOrder: c.sort_order as number,
  }))
  return orderCategories(rows).map(({ id, name, defaultKey }) => ({ id, name, defaultKey }))
}

export async function loadCategories(): Promise<Category[]> {
  const user = await requireUser()
  const supabase = await createClient()
  return fetchCategories(supabase, user.id)
}

export async function loadTransaction(id: string): Promise<TxRow | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').select(TX_COLUMNS).eq('id', id).eq('user_id', user.id).maybeSingle<TxRawRow>()
  if (error) throw error
  return data ? toTxRow(data) : null
}

export async function loadLedger(): Promise<{
  profile: Profile
  categories: Category[]
  transactions: TxRow[]
  goalMovements: GoalMovementRow[]
}> {
  const user = await requireUser()
  const supabase = await createClient()
  // Contas e entradas que se repetem aparecem ao abrir qualquer tela com números (etapa-3 §5).
  // Só a leitura de transactions depende da geração ter terminado; profile, categories e os
  // movimentos da meta não são afetados por ela e podem correr em paralelo.
  const occurrencesReady = ensureOccurrences(supabase)
  const [profile, categories, goalMovements] = await Promise.all([
    supabase.from('profiles').select('display_name, initial_balance_cents').single(),
    fetchCategories(supabase, user.id),
    fetchGoalMovements(supabase, user.id),
  ])
  await occurrencesReady
  const rawTxs = await fetchAllPages<TxRawRow>(async (from, to) => {
    const { data, error } = await supabase
      .from('transactions')
      .select(TX_COLUMNS)
      .eq('user_id', user.id)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
    return { data, error }
  })
  if (profile.error) throw profile.error
  return {
    profile: { displayName: profile.data.display_name, initialBalanceCents: Number(profile.data.initial_balance_cents) },
    categories,
    // Conta da família ainda a pagar não é de ninguém: fica fora do livro pessoal (RNF-11).
    transactions: personalLedger(rawTxs.map(toTxRow)),
    goalMovements,
  }
}
