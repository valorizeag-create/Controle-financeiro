import type { Cents } from './money'
import { isInMonth, type MonthKey } from './dates'
import { effectiveDate, type LedgerTx } from './summary'

export interface CardTx extends LedgerTx {
  cardId: string | null
}

/** Gasto confirmado com cartão cujo mês efetivo (RN-06) é o mês dado. Valor inteiro (RN-30, A1). */
export function spentByCard(txs: CardTx[], month: MonthKey): Map<string, Cents> {
  const result = new Map<string, Cents>()
  for (const t of txs) {
    if (t.kind !== 'expense' || t.cardId === null) continue
    const d = effectiveDate(t)
    if (d === null || !isInMonth(d, month)) continue
    result.set(t.cardId, (result.get(t.cardId) ?? 0) + t.amountCents)
  }
  return result
}
