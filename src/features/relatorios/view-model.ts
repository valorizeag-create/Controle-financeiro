import { addMonths, monthOf, type ISODate, type MonthKey } from '@/domain/dates'
import { formatCompactBRL } from '@/domain/money'
import { monthName } from '@/domain/recurrence'
import { compareCategories, monthReports, sumCategories } from '@/domain/reports'
import { effectiveDate } from '@/domain/summary'
import type { GoalMovementRow } from '@/features/metas/types'
import type { Category, Profile, TxRow } from '@/features/registro/queries'
import type { Period } from './period'

export type Sentence = (string | { value: string })[]

export function sentenceText(s: Sentence): string {
  return s.map((p) => (typeof p === 'string' ? p : p.value)).join('')
}

export interface ChartBar {
  month: MonthKey
  label: string
  fullLabel: string
  entrouText: string
  saiuText: string
  entrouHeight: number
  saiuHeight: number
}

export interface MonthRow {
  month: MonthKey
  label: string
  current: boolean
  entrouText: string
  saiuText: string
  goalText: string | null
}

export interface RelatoriosView {
  empty: boolean
  summary: Sentence
  changes: Sentence[]
  chart: ChartBar[] | null
  months: MonthRow[]
  categories: { name: string; cents: number; share: number }[]
}

const MAX_FULL_LABELS = 4

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const yearOf = (m: MonthKey) => Number(m.slice(0, 4))
const monthNumber = (m: MonthKey) => Number(m.slice(5, 7))

export function buildRelatorios(input: {
  period: Period
  today: ISODate
  profile: Profile
  categories: Category[]
  transactions: TxRow[]
  goalMovements: GoalMovementRow[]
}): RelatoriosView {
  const { period, today, profile, categories, transactions, goalMovements } = input
  const nameOf = new Map(categories.map((c) => [c.id, c.name]))
  const currentMonth = monthOf(today)
  const thisYear = yearOf(currentMonth)

  const reports = monthReports({
    months: [addMonths(period.from, -1), ...period.months],
    today,
    initialBalanceCents: profile.initialBalanceCents,
    transactions,
    goalMovements,
  })
  const inPeriod = reports.slice(1)
  const last = reports[reports.length - 1]
  const previous = reports[reports.length - 2]

  const plainName = (m: MonthKey) => monthName(monthNumber(m))
  const withYear = (m: MonthKey, name: string) => (yearOf(m) === thisYear ? name : `${name} de ${yearOf(m)}`)

  const lastMonth = period.months[period.months.length - 1]
  const summary: Sentence = [
    `Em ${withYear(lastMonth, plainName(lastMonth))}, entrou `,
    { value: formatCompactBRL(last.entrouCents) },
    ' e saiu ',
    { value: formatCompactBRL(last.saiuCents) },
    '.',
  ]

  const changes: Sentence[] = compareCategories(last.byCategory, previous.byCategory).map((c) => {
    const name = nameOf.get(c.categoryId) ?? 'Outros'
    const value = formatCompactBRL(Math.abs(c.deltaCents))
    return c.deltaCents < 0
      ? ['Você gastou ', { value }, ` a menos com ${name} do que no mês passado.`]
      : [`Seus gastos com ${name} subiram `, { value }, ' em relação ao mês passado.']
  })

  const peak = Math.max(0, ...inPeriod.flatMap((r) => [r.entrouCents, r.saiuCents]))
  const height = (cents: number) => (peak > 0 ? Math.round((cents / peak) * 100) : 0)
  const fullLabel = (m: MonthKey) => withYear(m, capitalize(plainName(m)))
  const chart: ChartBar[] | null =
    inPeriod.length >= 2
      ? inPeriod.map((r) => ({
          month: r.month,
          label: inPeriod.length <= MAX_FULL_LABELS ? capitalize(plainName(r.month)) : capitalize(plainName(r.month).slice(0, 3)),
          fullLabel: fullLabel(r.month),
          entrouText: formatCompactBRL(r.entrouCents),
          saiuText: formatCompactBRL(r.saiuCents),
          entrouHeight: height(r.entrouCents),
          saiuHeight: height(r.saiuCents),
        }))
      : null

  const months: MonthRow[] = [...inPeriod].reverse().map((r) => ({
    month: r.month,
    label: fullLabel(r.month),
    current: r.month === currentMonth,
    entrouText: `Entrou ${formatCompactBRL(r.entrouCents)}`,
    saiuText: `Saiu ${formatCompactBRL(r.saiuCents)}`,
    goalText: r.goalLine
      ? `${r.goalLine.label === 'Guardado este mês' ? 'Guardado' : 'Tirado das metas'} ${formatCompactBRL(r.goalLine.amountCents)}`
      : null,
  }))

  const totals = sumCategories(inPeriod.map((r) => r.byCategory))
  const top = totals[0]?.cents ?? 0
  const cats = totals.map((t) => ({ name: nameOf.get(t.categoryId) ?? 'Outros', cents: t.cents, share: top ? t.cents / top : 0 }))

  const empty = goalMovements.length === 0 && transactions.every((t) => effectiveDate(t) === null)

  return { empty, summary, changes, chart, months, categories: cats }
}
