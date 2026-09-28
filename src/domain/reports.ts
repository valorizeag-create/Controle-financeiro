import type { Cents } from './money'
import type { ISODate, MonthKey } from './dates'
import { spendingByCategory, type CategorizedTx, type CategoryTotal } from './breakdown'
import { summarizeMonth, type GoalLine, type GoalMovement } from './summary'

export interface MonthReport {
  month: MonthKey
  entrouCents: Cents
  saiuCents: Cents
  goalLine: GoalLine | null
  byCategory: CategoryTotal[]
}

export function monthReports(input: {
  months: MonthKey[]
  today: ISODate
  initialBalanceCents: Cents
  transactions: CategorizedTx[]
  goalMovements: GoalMovement[]
}): MonthReport[] {
  const { months, today, initialBalanceCents, transactions, goalMovements } = input
  return months.map((month) => {
    const s = summarizeMonth({ month, today, initialBalanceCents, transactions, goalMovements })
    return {
      month,
      entrouCents: s.entrouCents,
      saiuCents: s.saiuCents,
      goalLine: s.goalLine,
      byCategory: spendingByCategory(transactions, month),
    }
  })
}

export interface CategoryChange {
  categoryId: string
  currentCents: Cents
  previousCents: Cents
  deltaCents: Cents
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function compareCategories(current: CategoryTotal[], previous: CategoryTotal[], limit = 3): CategoryChange[] {
  const cur = new Map(current.map((c) => [c.categoryId, c.cents]))
  const prev = new Map(previous.map((c) => [c.categoryId, c.cents]))
  const ids = new Set([...cur.keys(), ...prev.keys()])
  return [...ids]
    .map((categoryId) => {
      const currentCents = cur.get(categoryId) ?? 0
      const previousCents = prev.get(categoryId) ?? 0
      return { categoryId, currentCents, previousCents, deltaCents: currentCents - previousCents }
    })
    .filter((c) => c.deltaCents !== 0)
    .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents) || byId(a.categoryId, b.categoryId))
    .slice(0, limit)
}

export function sumCategories(months: CategoryTotal[][]): CategoryTotal[] {
  const totals = new Map<string, Cents>()
  for (const list of months) {
    for (const { categoryId, cents } of list) totals.set(categoryId, (totals.get(categoryId) ?? 0) + cents)
  }
  return [...totals.entries()]
    .map(([categoryId, cents]) => ({ categoryId, cents }))
    .sort((a, b) => b.cents - a.cents || byId(a.categoryId, b.categoryId))
}
