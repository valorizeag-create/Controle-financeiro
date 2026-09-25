import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, requireUser } from '@/lib/supabase/server'
import type { CategorizedTx } from '@/domain/breakdown'
import { fetchAllPages } from './paging'
import { orderCategories } from '@/features/categorias/names'

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

async function fetchCategories(supabase: SupabaseClient): Promise<Category[]> {
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

export async function loadLedger(): Promise<{ profile: Profile; categories: Category[]; transactions: TxRow[] }> {
  await requireUser()
  const supabase = await createClient()
  const [profile, categories, rawTxs] = await Promise.all([
    supabase.from('profiles').select('display_name, initial_balance_cents').single(),
    fetchCategories(supabase),
    fetchAllPages<TxRawRow>(async (from, to) => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, kind, amount_cents, category_id, source, note, payment_method, occurred_on, status, due_on, paid_on, created_at')
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
    transactions: rawTxs.map((t) => ({
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
    })),
  }
}
