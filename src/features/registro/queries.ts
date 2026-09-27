import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, requireUser } from '@/lib/supabase/server'
import type { CategorizedTx } from '@/domain/breakdown'
import { fetchAllPages } from './paging'
import { orderCategories } from '@/features/categorias/names'
import { ensureOccurrences } from '@/features/contas/occurrences'

export type Profile = { displayName: string; initialBalanceCents: number }
export type Category = { id: string; name: string; defaultKey: string | null }
export interface TxRow extends CategorizedTx {
  id: string
  source: string | null
  note: string | null
  paymentMethod: string | null
  createdAt: string
}

type TxRawRow = {
  id: string
  kind: string
  amount_cents: number
  category_id: string | null
  source: string | null
  note: string | null
  payment_method: string | null
  occurred_on: string
  status: string
  due_on: string | null
  paid_on: string | null
  created_at: string
}

const TX_COLUMNS = 'id, kind, amount_cents, category_id, source, note, payment_method, occurred_on, status, due_on, paid_on, created_at'

function toTxRow(t: TxRawRow): TxRow {
  return {
    id: t.id,
    kind: t.kind as 'income' | 'expense',
    amountCents: Number(t.amount_cents),
    categoryId: t.category_id,
    source: t.source,
    note: t.note,
    paymentMethod: t.payment_method,
    occurredOn: t.occurred_on,
    status: t.status as 'confirmed' | 'pending',
    dueOn: t.due_on,
    paidOn: t.paid_on,
    goalFundedCents: 0,
    createdAt: t.created_at,
  }
}

async function fetchCategories(supabase: SupabaseClient): Promise<Category[]> {
  // O `.order('sort_order')` aqui é só para a página vir com uma ordem razoável;
  // orderCategories() abaixo é quem decide a ordem final (Outros sempre por último).
  const { data, error } = await supabase.from('categories').select('id, name, default_key, sort_order').order('sort_order')
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
  await requireUser()
  const supabase = await createClient()
  return fetchCategories(supabase)
}

export async function loadTransaction(id: string): Promise<TxRow | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').select(TX_COLUMNS).eq('id', id).eq('user_id', user.id).maybeSingle<TxRawRow>()
  if (error) throw error
  return data ? toTxRow(data) : null
}

export async function loadLedger(): Promise<{ profile: Profile; categories: Category[]; transactions: TxRow[] }> {
  await requireUser()
  const supabase = await createClient()
  // Contas e entradas que se repetem aparecem ao abrir qualquer tela com números (etapa-3 §5)
  await ensureOccurrences(supabase)
  const [profile, categories, rawTxs] = await Promise.all([
    supabase.from('profiles').select('display_name, initial_balance_cents').single(),
    fetchCategories(supabase),
    fetchAllPages<TxRawRow>(async (from, to) => {
      const { data, error } = await supabase
        .from('transactions')
        .select(TX_COLUMNS)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
      return { data, error }
    }),
  ])
  if (profile.error) throw profile.error
  return {
    profile: { displayName: profile.data.display_name, initialBalanceCents: Number(profile.data.initial_balance_cents) },
    categories,
    transactions: rawTxs.map(toTxRow),
  }
}
