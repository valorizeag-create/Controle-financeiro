import type { MonthKey } from '@/domain/dates'

export interface BudgetRow {
  month: MonthKey
  categoryId: string
  amountCents: number
}

export type BudgetRawRow = { month: string; category_id: string; amount_cents: number | string }

export const BUDGET_COLUMNS = 'month, category_id, amount_cents'

export function toBudgetRow(r: BudgetRawRow): BudgetRow {
  return { month: r.month.slice(0, 7), categoryId: r.category_id, amountCents: Number(r.amount_cents) }
}
