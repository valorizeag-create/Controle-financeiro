import { addMonths, monthLabel, monthOf, type ISODate, type MonthKey } from '@/domain/dates'
import { formatCompactBRL } from '@/domain/money'
import { monthName } from '@/domain/recurrence'
import { budgetLines, withinCount, type BudgetLine, type BudgetState } from '@/domain/planning'
import { centsToInput } from '@/features/registro/form-values'
import type { Category, TxRow } from '@/features/registro/queries'
import type { BudgetRow } from './types'

export const ADJUST_LABEL = 'Quer ajustar o valor deste mês?'
const MAX_CARD_LINES = 3

export interface BudgetLineView {
  categoryId: string
  name: string
  amountsText: string
  percent: number
  state: BudgetState
  statusText: string
  adjustHref: string
  /** Só nas categorias que passaram do planejado; o componente mostra o link com este texto. */
  adjustLabel: string | null
}

export interface PlanejamentoView {
  month: MonthKey
  empty: boolean
  heroLabel: string
  totalCents: number
  withinText: string
  lines: BudgetLineView[]
  editHref: string
  repeatFrom: { label: string } | null
}

export interface PlannedCardView {
  /** Frase de abertura: quanto falta na categoria mais perto do limite (ou o que passou). */
  leadText: string | null
  withinText: string
  lines: BudgetLineView[]
}

export interface PlanFormView {
  month: MonthKey
  monthText: string
  fields: { categoryId: string; name: string; value: string; autoFocus: boolean }[]
}

interface BuildInput {
  month: MonthKey
  today: ISODate
  categories: Category[]
  transactions: TxRow[]
  budgets: BudgetRow[]
}

function nameOfMonth(month: MonthKey, today: ISODate): string {
  return month.slice(0, 4) === today.slice(0, 4) ? monthName(Number(month.slice(5, 7))) : monthLabel(month)
}

function statusOf(line: BudgetLine): string {
  if (line.state === 'within') return `Ainda tem ${formatCompactBRL(line.remainingCents)} disponível.`
  if (line.state === 'near') return 'Falta pouco para chegar ao que você planejou.'
  return `Passou ${formatCompactBRL(line.overCents)} do planejado.`
}

function planned(input: BuildInput): { line: BudgetLine; name: string }[] {
  const byCategory = new Map(input.budgets.filter((b) => b.month === input.month).map((b) => [b.categoryId, b.amountCents]))
  const active = input.categories.filter((c) => byCategory.has(c.id))
  const lines = budgetLines({
    month: input.month,
    transactions: input.transactions,
    planned: active.map((c) => ({ categoryId: c.id, plannedCents: byCategory.get(c.id)! })),
  })
  return lines.map((line, i) => ({ line, name: active[i].name }))
}

function toView(month: MonthKey, { line, name }: { line: BudgetLine; name: string }): BudgetLineView {
  return {
    categoryId: line.categoryId,
    name,
    amountsText: `${formatCompactBRL(line.spentCents)} de ${formatCompactBRL(line.plannedCents)}`,
    percent: line.percent,
    state: line.state,
    statusText: statusOf(line),
    adjustHref: `/planejamento/editar?mes=${month}&categoria=${line.categoryId}`,
    adjustLabel: line.state === 'over' ? ADJUST_LABEL : null,
  }
}

function withinSentence(lines: BudgetLine[]): string {
  return `Você está dentro do planejado em ${withinCount(lines)} de ${lines.length} categorias.`
}

export function buildPlanejamento(input: BuildInput): PlanejamentoView {
  const items = planned(input)
  const empty = items.length === 0
  const previous = addMonths(input.month, -1)
  const previousHasPlan = input.budgets.some((b) => b.month === previous && input.categories.some((c) => c.id === b.categoryId))
  return {
    month: input.month,
    empty,
    heroLabel: `Planejado para ${nameOfMonth(input.month, input.today)}`,
    totalCents: items.reduce((sum, i) => sum + i.line.plannedCents, 0),
    withinText: withinSentence(items.map((i) => i.line)),
    lines: items.map((i) => toView(input.month, i)),
    editHref: `/planejamento/editar?mes=${input.month}`,
    repeatFrom: empty && previousHasPlan ? { label: `Repetir o planejamento de ${nameOfMonth(previous, input.today)}` } : null,
  }
}

function leadOf(items: { line: BudgetLine; name: string }[]): string | null {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR')
  const open = items.filter((i) => i.line.state !== 'over' && i.line.remainingCents > 0)
  if (open.length > 0) {
    const pick = [...open].sort((a, b) => a.line.remainingCents - b.line.remainingCents || byName(a, b))[0]
    return `Você ainda tem ${formatCompactBRL(pick.line.remainingCents)} para ${pick.name} este mês.`
  }
  const over = items.filter((i) => i.line.state === 'over')
  if (over.length > 0) {
    const pick = [...over].sort((a, b) => b.line.overCents - a.line.overCents || byName(a, b))[0]
    return `${pick.name}: Passou ${formatCompactBRL(pick.line.overCents)} do planejado.`
  }
  return null
}

export function buildPlannedCard(input: BuildInput): PlannedCardView | null {
  if (input.month !== monthOf(input.today)) return null
  const items = planned(input)
  if (items.length === 0) return null
  const top = [...items]
    .sort(
      (a, b) =>
        b.line.usage - a.line.usage ||
        b.line.plannedCents - a.line.plannedCents ||
        a.name.localeCompare(b.name, 'pt-BR'),
    )
    .slice(0, MAX_CARD_LINES)
  return {
    leadText: leadOf(items),
    withinText: withinSentence(items.map((i) => i.line)),
    lines: top.map((i) => toView(input.month, i)),
  }
}

export function buildPlanForm(input: {
  month: MonthKey
  categories: Category[]
  budgets: BudgetRow[]
  focusCategoryId: string | null
}): PlanFormView {
  const byCategory = new Map(input.budgets.filter((b) => b.month === input.month).map((b) => [b.categoryId, b.amountCents]))
  const label = monthLabel(input.month)
  return {
    month: input.month,
    monthText: label.charAt(0).toUpperCase() + label.slice(1),
    fields: input.categories.map((c) => ({
      categoryId: c.id,
      name: c.name,
      value: byCategory.has(c.id) ? centsToInput(byCategory.get(c.id)!) : '',
      autoFocus: c.id === input.focusCategoryId,
    })),
  }
}
