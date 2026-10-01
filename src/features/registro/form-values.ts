import { addDays, type ISODate } from '@/domain/dates'
import type { Cents } from '@/domain/money'

// Sem separador de milhar: "5000,00" é o que a pessoa digitaria e parseBRL aceita de volta.
export function centsToInput(cents: Cents): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '-' : ''
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

export type EditableRecord = {
  id: string
  kind: 'income' | 'expense'
  amountCents: Cents
  categoryId: string | null
  source: string | null
  note: string | null
  paymentMethod: string | null
  occurredOn: ISODate
  cardId?: string | null
  familyId?: string | null
}

export function recordToFormValues(r: EditableRecord, today: ISODate): Record<string, string> {
  const when = r.occurredOn === today ? 'today' : r.occurredOn === addDays(today, -1) ? 'yesterday' : 'other'
  return {
    amount: centsToInput(r.amountCents),
    categoryId: r.categoryId ?? '',
    source: r.source ?? '',
    note: r.note ?? '',
    paymentMethod: r.paymentMethod ?? '',
    cardId: r.cardId ?? '',
    family: r.familyId ? 'on' : '',
    when,
    date: when === 'other' ? r.occurredOn : '',
  }
}
