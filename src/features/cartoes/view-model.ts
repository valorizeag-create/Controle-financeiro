import type { Cents } from '@/domain/money'
import { monthLabel, type MonthKey } from '@/domain/dates'
import { monthName } from '@/domain/recurrence'
import { spentByCard } from '@/domain/cards'
import type { TxRow } from '@/features/registro/tx-row'
import type { CardRow } from './types'

export interface CartoesItem {
  card: CardRow
  spentCents: Cents
  spentLabel: string
  gastosHref: string
}

export interface CartoesView {
  month: MonthKey
  label: string
  items: CartoesItem[]
}

export function buildCartoes(input: { month: MonthKey; cards: CardRow[]; transactions: TxRow[] }): CartoesView {
  const { month, cards, transactions } = input
  const spent = spentByCard(transactions, month)
  const spentLabel = `Gasto neste cartão em ${monthName(Number(month.slice(5, 7)))}`
  return {
    month,
    label: monthLabel(month),
    items: cards.map((card) => ({
      card,
      spentCents: spent.get(card.id) ?? 0,
      spentLabel,
      gastosHref: `/extrato?mes=${month}&cartao=${card.id}`,
    })),
  }
}
