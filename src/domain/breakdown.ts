import type { Cents } from './money'
import { isInMonth, type MonthKey } from './dates'
import { effectiveDate, type LedgerTx } from './summary'

export interface CategorizedTx extends LedgerTx {
  categoryId: string | null
}

export interface CategoryTotal {
  categoryId: string
  cents: Cents
}

export function spendingByCategory(txs: CategorizedTx[], month: MonthKey): CategoryTotal[] {
  const totals = new Map<string, Cents>()
  for (const t of txs) {
    const d = effectiveDate(t)
    if (t.kind !== 'expense' || t.categoryId === null || d === null || !isInMonth(d, month)) continue
    const own = t.amountCents - t.goalFundedCents
    if (own <= 0) continue
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + own)
  }
  return [...totals.entries()]
    .map(([categoryId, cents]) => ({ categoryId, cents }))
    .sort((a, b) => b.cents - a.cents)
}
