import { dayMonthLabel, dayMonthYearLabel, type ISODate } from '@/domain/dates'
import { remainingInstallments } from '@/domain/installments'
import { formatBRL, type Cents } from '@/domain/money'
import { paymentText, type CardRow } from '@/features/cartoes/types'
import { txName } from '@/features/contas/view-model'
import type { Category, TxRow } from '@/features/registro/queries'
import type { PlanRow } from './types'

export interface PurchaseRow {
  id: string
  title: string
  detail: string
  amountCents: Cents
}

export interface PurchaseView {
  id: string
  title: string
  totalText: string
  payment: string | null
  remainingText: string | null
  statusText: string | null
  canClose: boolean
  remainingCents: Cents
  rows: PurchaseRow[]
}

export function buildPurchase(input: { plan: PlanRow; rows: TxRow[]; categories: Category[]; cards: CardRow[]; today: ISODate }): PurchaseView {
  const { plan, rows, categories, cards, today } = input

  const installments = rows.filter((r) => r.installmentNumber !== null).sort((a, b) => a.installmentNumber! - b.installmentNumber!)
  const rest = rows.filter((r) => r.installmentNumber === null)
  const first = installments[0] ?? rows[0] ?? null

  const title = first ? txName(first, categories) : 'Outros'
  const payment = first ? paymentText(first, cards) : null
  const totalText = `${formatBRL(plan.totalCents)} em ${plan.count} parcelas`

  const purchaseRows: PurchaseRow[] = [
    ...installments.map((r) => ({
      id: r.id,
      title: `Parcela ${r.installmentNumber} de ${r.installmentCount}`,
      detail: dayMonthYearLabel(r.occurredOn),
      amountCents: r.amountCents,
    })),
    ...rest.map((r) => ({
      id: r.id,
      title: 'Restante quitado',
      detail: dayMonthYearLabel(r.occurredOn),
      amountCents: r.amountCents,
    })),
  ]

  let remainingText: string | null = null
  let canClose = false
  let remainingCents: Cents = 0
  if (plan.status === 'active') {
    const remaining = remainingInstallments(installments, today)
    remainingCents = remaining.cents
    canClose = remaining.count > 0
    remainingText =
      remaining.count === 0
        ? null
        : remaining.count === 1
          ? `Falta 1 parcela: ${formatBRL(remaining.cents)}.`
          : `Faltam ${remaining.count} parcelas: ${formatBRL(remaining.cents)}.`
  }

  const statusText =
    plan.status === 'settled' && plan.closedOn
      ? `Quitada em ${dayMonthLabel(plan.closedOn)}.`
      : plan.status === 'refunded' && plan.closedOn
        ? `Devolvida em ${dayMonthLabel(plan.closedOn)}.`
        : null

  return {
    id: plan.id,
    title,
    totalText,
    payment,
    remainingText,
    statusText,
    canClose,
    remainingCents,
    rows: purchaseRows,
  }
}
