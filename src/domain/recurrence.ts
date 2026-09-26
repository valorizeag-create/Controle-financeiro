import { addMonths, dayMonthLabel, monthOf, type ISODate, type MonthKey } from './dates'

export type Frequency = 'monthly' | 'yearly'

export interface RecurrenceRule {
  frequency: Frequency
  dueDay: number
  dueMonth: number | null
}

// Quem ficou sem abrir o app recebe no máximo os últimos 3 meses de contas
// (o SQL de geração de ocorrências espelha esta constante).
export const CATCH_UP_MONTHS = 3

const monthNameFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })

export function monthName(month: number): string {
  return monthNameFmt.format(new Date(Date.UTC(2000, month - 1, 1)))
}

export function daysInMonth(m: MonthKey): number {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

export function dueDateIn(m: MonthKey, day: number): ISODate {
  return `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, '0')}`
}

export function occursIn(rule: RecurrenceRule, m: MonthKey): boolean {
  if (rule.frequency === 'monthly') return true
  return Number(m.slice(5)) === rule.dueMonth
}

export function nextDueOnOrAfter(rule: RecurrenceRule, from: ISODate): ISODate {
  const first: MonthKey =
    rule.frequency === 'monthly' ? monthOf(from) : `${from.slice(0, 4)}-${String(rule.dueMonth).padStart(2, '0')}`
  const due = dueDateIn(first, rule.dueDay)
  if (due >= from) return due
  return dueDateIn(addMonths(first, rule.frequency === 'monthly' ? 1 : 12), rule.dueDay)
}

export function daysUntil(from: ISODate, to: ISODate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function relativeDue(dueOn: ISODate, today: ISODate): string {
  const n = daysUntil(today, dueOn)
  if (n === 0) return 'hoje'
  if (n === 1) return 'amanhã'
  return `em ${n} dias`
}

export function dueText(dueOn: ISODate, today: ISODate): string {
  return dueOn < today ? `venceu em ${dayMonthLabel(dueOn)}` : `vence ${relativeDue(dueOn, today)}`
}

export function recurrenceLabel(rule: RecurrenceRule): string {
  return rule.frequency === 'monthly' ? `Todo mês · dia ${rule.dueDay}` : `Todo ano · ${monthName(rule.dueMonth!)}`
}
