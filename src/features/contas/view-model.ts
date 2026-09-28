import { dayMonthLabel, isInMonth, monthLabel, monthOf, type ISODate, type MonthKey } from '@/domain/dates'
import { monthName, recurrenceLabel, relativeDue } from '@/domain/recurrence'
import { formatBRL } from '@/domain/money'
import { summarizeMonth } from '@/domain/summary'
import type { GoalMovementRow } from '@/features/metas/types'
import type { Category, Profile, TxRow } from '@/features/registro/queries'
import type { RecurrenceRow } from './types'

export type ContasTab = 'a-pagar' | 'pagas' | 'vencidas'

export function parseContasTab(v: string | undefined): ContasTab {
  return v === 'pagas' || v === 'vencidas' ? v : 'a-pagar'
}

export function txName(tx: TxRow, categories: Category[]): string {
  if (tx.note) return tx.note
  if (tx.kind === 'expense') {
    const category = categories.find((c) => c.id === tx.categoryId)
    return category ? category.name : 'Outros'
  }
  return tx.source ?? 'Entrada'
}

export interface ContasItem {
  id: string
  name: string
  amountCents: number
  caption: string
}

export interface RecurringItem {
  id: string
  name: string
  caption: string
  amountCents: number
}

export interface ContasView {
  month: MonthKey
  label: string
  isCurrentMonth: boolean
  tab: ContasTab
  counts: Record<ContasTab, number>
  aPagarLabel: string
  aPagarCents: number
  disponivelDepoisCents: number
  bills: ContasItem[]
  incomes: ContasItem[]
  recurringBills: RecurringItem[]
  recurringIncomes: RecurringItem[]
}

function dayOf(d: ISODate): number {
  return Number(d.slice(8, 10))
}

// "no escopo": pendências deste mês, mais o que ficou para trás (decisão 1) —
// só quando M é o mês atual, para não empilhar atraso de meses já virados.
function inScope(dueOn: ISODate, month: MonthKey, isCurrentMonth: boolean): boolean {
  if (isInMonth(dueOn, month)) return true
  return isCurrentMonth && dueOn < `${month}-01`
}

// Mesmo dia de vencimento: ordem estável por nome e, por fim, por id (nunca por ordem de leitura do banco).
function makeByDueOnAsc(categories: Category[]) {
  return (a: TxRow & { dueOn: ISODate | null }, b: TxRow & { dueOn: ISODate | null }): number => {
    const dueOnA = a.dueOn ?? ''
    const dueOnB = b.dueOn ?? ''
    if (dueOnA !== dueOnB) return dueOnA < dueOnB ? -1 : 1
    const nameA = txName(a, categories)
    const nameB = txName(b, categories)
    if (nameA !== nameB) return nameA < nameB ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }
}

export function buildContas(input: {
  month: MonthKey
  today: ISODate
  tab: ContasTab
  profile: Profile
  categories: Category[]
  transactions: TxRow[]
  recurrences: RecurrenceRow[]
  goalMovements: GoalMovementRow[]
}): ContasView {
  const { month, today, tab, profile, categories, transactions, recurrences, goalMovements } = input
  const isCurrentMonth = monthOf(today) === month

  const pendingBills = transactions.filter(
    (t): t is TxRow & { dueOn: ISODate } => t.kind === 'expense' && t.status === 'pending' && t.dueOn !== null && inScope(t.dueOn, month, isCurrentMonth),
  )
  const byDueOnAsc = makeByDueOnAsc(categories)
  const aPagarList = pendingBills.filter((t) => t.dueOn >= today).sort(byDueOnAsc)
  const vencidasList = pendingBills.filter((t) => t.dueOn < today).sort(byDueOnAsc)
  const pagasList = transactions
    .filter(
      (t): t is TxRow & { dueOn: ISODate; paidOn: ISODate } =>
        t.kind === 'expense' && t.status === 'confirmed' && t.dueOn !== null && t.paidOn !== null && isInMonth(t.paidOn, month),
    )
    .sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1))

  const toBillItem = (t: TxRow, caption: string): ContasItem => ({ id: t.id, name: txName(t, categories), amountCents: t.amountCents, caption })

  const listByTab: Record<ContasTab, ContasItem[]> = {
    'a-pagar': aPagarList.map((t) => toBillItem(t, `${formatBRL(t.amountCents)} · vence dia ${dayOf(t.dueOn)} · ${relativeDue(t.dueOn, today)}`)),
    vencidas: vencidasList.map((t) => toBillItem(t, `${formatBRL(t.amountCents)} · venceu em ${dayMonthLabel(t.dueOn)}`)),
    pagas: pagasList.map((t) => toBillItem(t, `${formatBRL(t.amountCents)} · paga em ${dayMonthLabel(t.paidOn)}`)),
  }

  const incomes: ContasItem[] = transactions
    .filter((t): t is TxRow & { dueOn: ISODate } => t.kind === 'income' && t.status === 'pending' && t.dueOn !== null && inScope(t.dueOn, month, isCurrentMonth))
    .sort(byDueOnAsc)
    .map((t) =>
      toBillItem(
        t,
        isInMonth(t.dueOn, month)
          ? `${formatBRL(t.amountCents)} · previsto para dia ${dayOf(t.dueOn)}`
          : `${formatBRL(t.amountCents)} · previsto para ${dayMonthLabel(t.dueOn)}`,
      ),
    )

  const activeRecurrences = recurrences.filter((r) => r.endedOn === null)
  const toRecurringItem = (r: RecurrenceRow): RecurringItem => ({ id: r.id, name: r.name, caption: recurrenceLabel(r), amountCents: r.amountCents })
  const byName = (a: RecurringItem, b: RecurringItem) => a.name.localeCompare(b.name, 'pt-BR')
  const recurringBills = activeRecurrences.filter((r) => r.kind === 'expense').map(toRecurringItem).sort(byName)
  const recurringIncomes = activeRecurrences.filter((r) => r.kind === 'income').map(toRecurringItem).sort(byName)

  const summary = summarizeMonth({ month, today, initialBalanceCents: profile.initialBalanceCents, transactions, goalMovements })

  return {
    month,
    label: monthLabel(month),
    isCurrentMonth,
    tab,
    counts: { 'a-pagar': listByTab['a-pagar'].length, pagas: listByTab.pagas.length, vencidas: listByTab.vencidas.length },
    aPagarLabel: `A pagar em ${monthName(Number(month.slice(5, 7)))}`,
    aPagarCents: summary.contasAPagarCents,
    disponivelDepoisCents: summary.disponivelDepoisContasCents,
    bills: listByTab[tab],
    incomes,
    recurringBills,
    recurringIncomes,
  }
}
