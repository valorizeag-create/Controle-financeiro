import 'server-only'
import { createClient, requireUser } from '@/lib/supabase/server'
import { TX_COLUMNS, toTxRow, type TxRawRow, type TxRow } from '@/features/registro/tx-row'
import { PLAN_COLUMNS, toPlanRow, type PlanRawRow, type PlanRow } from './types'

export async function loadPurchase(id: string): Promise<{ plan: PlanRow; rows: TxRow[] } | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const [plan, rows] = await Promise.all([
    supabase.from('installment_plans').select(PLAN_COLUMNS).eq('id', id).eq('user_id', user.id).maybeSingle<PlanRawRow>(),
    supabase
      .from('transactions')
      .select(TX_COLUMNS)
      .eq('installment_plan_id', id)
      .eq('user_id', user.id)
      .order('installment_number', { ascending: true, nullsFirst: false }),
  ])
  if (plan.error) throw plan.error
  if (rows.error) throw rows.error
  if (!plan.data) return null
  return {
    plan: toPlanRow(plan.data),
    rows: (rows.data as TxRawRow[]).map(toTxRow),
  }
}
