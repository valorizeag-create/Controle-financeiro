import type { CategorizedTx } from '@/domain/breakdown'

export interface TxRow extends CategorizedTx {
  id: string
  source: string | null
  note: string | null
  paymentMethod: string | null
  createdAt: string
  cardId: string | null
  cardDeleted: boolean
  installmentPlanId: string | null
  installmentNumber: number | null
  installmentCount: number | null
}

export type TxRawRow = {
  id: string
  kind: string
  amount_cents: number | string
  category_id: string | null
  source: string | null
  note: string | null
  payment_method: string | null
  occurred_on: string
  status: string
  due_on: string | null
  paid_on: string | null
  created_at: string
  card_id: string | null
  card_deleted: boolean
  installment_plan_id: string | null
  installment_number: number | null
  installment_count: number | null
}

export const TX_COLUMNS =
  'id, kind, amount_cents, category_id, source, note, payment_method, occurred_on, status, due_on, paid_on, created_at, card_id, card_deleted, installment_plan_id, installment_number, installment_count'

export function toTxRow(t: TxRawRow): TxRow {
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
    cardId: t.card_id,
    cardDeleted: t.card_deleted,
    installmentPlanId: t.installment_plan_id,
    installmentNumber: t.installment_number === null ? null : Number(t.installment_number),
    installmentCount: t.installment_count === null ? null : Number(t.installment_count),
  }
}
