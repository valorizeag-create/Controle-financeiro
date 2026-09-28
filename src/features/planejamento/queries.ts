import 'server-only'
import { createClient, requireUser } from '@/lib/supabase/server'
import type { MonthKey } from '@/domain/dates'
import { BUDGET_COLUMNS, toBudgetRow, type BudgetRawRow, type BudgetRow } from './types'

/** Poucos meses × poucas categorias: lista pequena, sem paginação. */
export async function loadBudgets(months: MonthKey[]): Promise<BudgetRow[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('budgets')
    .select(BUDGET_COLUMNS)
    .eq('user_id', user.id)
    .in(
      'month',
      months.map((m) => `${m}-01`),
    )
  if (error) throw error
  return (data as BudgetRawRow[]).map(toBudgetRow)
}
