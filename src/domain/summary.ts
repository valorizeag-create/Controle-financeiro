import type { Cents } from './money'
import { isInMonth, monthOf, type ISODate, type MonthKey } from './dates'

export type TxKind = 'income' | 'expense'
export type TxStatus = 'confirmed' | 'pending'

export interface LedgerTx {
  kind: TxKind
  amountCents: Cents
  occurredOn: ISODate
  status: TxStatus
  dueOn: ISODate | null
  paidOn: ISODate | null
  goalFundedCents: Cents
}

export type GoalMovementKind = 'deposit' | 'withdraw' | 'use' | 'return_on_exit'

export interface GoalMovement {
  kind: GoalMovementKind
  amountCents: Cents
  occurredOn: ISODate
}

export interface GoalLine {
  label: 'Guardado este mês' | 'Tirado das metas'
  amountCents: Cents
}

export interface MonthSummary {
  entrouCents: Cents
  saiuCents: Cents
  goalLine: GoalLine | null
  disponivelCents: Cents
  contasAPagarCents: Cents
  disponivelDepoisContasCents: Cents
  saldoTotalCents: Cents
  guardadoTotalCents: Cents
}

/** Data em que o dinheiro realmente entrou ou saiu. Registros pendentes não têm. */
export function effectiveDate(tx: LedgerTx): ISODate | null {
  if (tx.status !== 'confirmed') return null
  return tx.paidOn ?? tx.occurredOn
}

/** Parte do gasto que saiu do dinheiro do mês (o resto veio de uma meta). */
function ownMoney(tx: LedgerTx): Cents {
  return tx.amountCents - tx.goalFundedCents
}

const sum = (xs: Cents[]) => xs.reduce((a, b) => a + b, 0)

export function summarizeMonth(input: {
  month: MonthKey
  today: ISODate
  initialBalanceCents: Cents
  transactions: LedgerTx[]
  goalMovements: GoalMovement[]
}): MonthSummary {
  const { month, today, initialBalanceCents, transactions, goalMovements } = input

  const inMonth = transactions.filter((t) => {
    const d = effectiveDate(t)
    return d !== null && isInMonth(d, month)
  })
  const entrouCents = sum(inMonth.filter((t) => t.kind === 'income').map((t) => t.amountCents))
  const saiuCents = sum(inMonth.filter((t) => t.kind === 'expense').map(ownMoney))

  const movesInMonth = goalMovements.filter((m) => isInMonth(m.occurredOn, month))
  const guardadoLiquido =
    sum(movesInMonth.filter((m) => m.kind === 'deposit').map((m) => m.amountCents)) -
    sum(movesInMonth.filter((m) => m.kind === 'withdraw' || m.kind === 'return_on_exit').map((m) => m.amountCents))

  const goalLine: GoalLine | null =
    guardadoLiquido > 0
      ? { label: 'Guardado este mês', amountCents: guardadoLiquido }
      : guardadoLiquido < 0
        ? { label: 'Tirado das metas', amountCents: -guardadoLiquido }
        : null

  const disponivelCents = entrouCents - saiuCents - guardadoLiquido

  const isCurrentMonth = monthOf(today) === month
  const contasAPagarCents = sum(
    transactions
      .filter((t) => {
        if (t.kind !== 'expense' || t.status !== 'pending' || t.dueOn === null) return false
        if (isInMonth(t.dueOn, month)) return true
        return isCurrentMonth && t.dueOn < `${month}-01`
      })
      .map((t) => t.amountCents),
  )

  const untilToday = transactions.filter((t) => {
    const d = effectiveDate(t)
    return d !== null && d <= today
  })
  const movesUntilToday = goalMovements.filter((m) => m.occurredOn <= today)
  const usesCents = sum(movesUntilToday.filter((m) => m.kind === 'use').map((m) => m.amountCents))

  const saldoTotalCents =
    initialBalanceCents +
    sum(untilToday.filter((t) => t.kind === 'income').map((t) => t.amountCents)) -
    sum(untilToday.filter((t) => t.kind === 'expense').map(ownMoney)) -
    usesCents

  const guardadoTotalCents =
    sum(movesUntilToday.filter((m) => m.kind === 'deposit').map((m) => m.amountCents)) -
    sum(movesUntilToday.filter((m) => m.kind !== 'deposit').map((m) => m.amountCents))

  return {
    entrouCents,
    saiuCents,
    goalLine,
    disponivelCents,
    contasAPagarCents,
    disponivelDepoisContasCents: disponivelCents - contasAPagarCents,
    saldoTotalCents,
    guardadoTotalCents,
  }
}
