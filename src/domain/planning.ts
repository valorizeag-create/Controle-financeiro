import type { Cents } from './money'
import type { MonthKey } from './dates'
import { spendingByCategory, type CategorizedTx } from './breakdown'

/** A partir de quanto do planejado o gasto passa a ser "perto do limite". */
export const NEAR_LIMIT_PERCENT = 90

export type BudgetState = 'within' | 'near' | 'over'

export interface PlannedCategory {
  categoryId: string
  plannedCents: Cents
}

export interface BudgetLine {
  categoryId: string
  plannedCents: Cents
  spentCents: Cents
  remainingCents: Cents
  overCents: Cents
  /** Barra: 0 a 100, sem passar de 100. */
  percent: number
  /** Gasto / planejado, sem limite (para ordenar). */
  usage: number
  state: BudgetState
}

export function budgetState(spentCents: Cents, plannedCents: Cents): BudgetState {
  if (spentCents > plannedCents) return 'over'
  if (spentCents * 100 >= plannedCents * NEAR_LIMIT_PERCENT) return 'near'
  return 'within'
}

export function budgetLines(input: {
  month: MonthKey
  transactions: CategorizedTx[]
  planned: PlannedCategory[]
}): BudgetLine[] {
  const spent = new Map(spendingByCategory(input.transactions, input.month).map((t) => [t.categoryId, t.cents]))
  return input.planned.map(({ categoryId, plannedCents }) => {
    const spentCents = spent.get(categoryId) ?? 0
    return {
      categoryId,
      plannedCents,
      spentCents,
      remainingCents: Math.max(0, plannedCents - spentCents),
      overCents: Math.max(0, spentCents - plannedCents),
      percent: plannedCents > 0 ? Math.min(100, Math.floor((spentCents * 100) / plannedCents)) : 100,
      usage: plannedCents > 0 ? spentCents / plannedCents : 0,
      state: budgetState(spentCents, plannedCents),
    }
  })
}

/** Quantas categorias não passaram do planejado (dentro e perto contam). */
export function withinCount(lines: BudgetLine[]): number {
  return lines.filter((l) => l.state !== 'over').length
}
