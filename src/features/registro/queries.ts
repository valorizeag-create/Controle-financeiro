import 'server-only'
import { createClient, requireUser } from '@/lib/supabase/server'
import type { CategorizedTx } from '@/domain/breakdown'

export type Profile = { displayName: string; initialBalanceCents: number }
export type Category = { id: string; name: string; defaultKey: string | null }
export interface TxRow extends CategorizedTx {
  id: string
  source: string | null
  note: string | null
  paymentMethod: string | null
  createdAt: string
}

export async function loadCategories(): Promise<Category[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('categories').select('id, name, default_key').order('sort_order')
  if (error) throw error
  return data.map((c) => ({ id: c.id, name: c.name, defaultKey: c.default_key }))
}

export async function loadLedger(): Promise<{ profile: Profile; categories: Category[]; transactions: TxRow[] }> {
  await requireUser()
  const supabase = await createClient()
  const [profile, categories, txs] = await Promise.all([
    supabase.from('profiles').select('display_name, initial_balance_cents').single(),
    loadCategories(),
    supabase
      .from('transactions')
      .select('id, kind, amount_cents, category_id, source, note, payment_method, occurred_on, status, due_on, paid_on, created_at')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ])
  if (profile.error) throw profile.error
  if (txs.error) throw txs.error
  return {
    profile: { displayName: profile.data.display_name, initialBalanceCents: Number(profile.data.initial_balance_cents) },
    categories,
    transactions: txs.data.map((t) => ({
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
