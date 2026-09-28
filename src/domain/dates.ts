export type ISODate = string
export type MonthKey = string

export const TZ = 'America/Sao_Paulo'

const isoInTz = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayMonthFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' })

function toUTC(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

function fromUTC(date: Date): ISODate {
  return date.toISOString().slice(0, 10)
}

export function todayInSaoPaulo(now: Date = new Date()): ISODate {
  return isoInTz.format(now)
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return fromUTC(toUTC(s)) === s
}

export function addDays(d: ISODate, n: number): ISODate {
  const date = toUTC(d)
  date.setUTCDate(date.getUTCDate() + n)
  return fromUTC(date)
}

export function monthOf(d: ISODate): MonthKey {
  return d.slice(0, 7)
}

export function parseMonthKey(s: string | null | undefined): MonthKey | null {
  return s && /^20\d{2}-(0[1-9]|1[0-2])$/.test(s) ? s : null
}

export function addMonths(m: MonthKey, n: number): MonthKey {
  const [y, mo] = m.split('-').map(Number)
  const date = new Date(Date.UTC(y, mo - 1 + n, 1))
  return date.toISOString().slice(0, 7)
}

export function isInMonth(d: ISODate, m: MonthKey): boolean {
  return monthOf(d) === m
}

export function monthLabel(m: MonthKey): string {
  return monthFmt.format(toUTC(`${m}-01`))
}

export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

const SHORT_MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']

export function shortMonthLabel(m: MonthKey): string {
  const [y, mo] = m.split('-').map(Number)
  return `${SHORT_MONTHS[mo - 1]} ${y}`
}

export function dayMonthLabel(d: ISODate): string {
  return dayMonthFmt.format(toUTC(d))
}

export function dayMonthYearLabel(d: ISODate): string {
  return `${dayMonthLabel(d)} de ${d.slice(0, 4)}`
}

export function dayLabel(d: ISODate, today: ISODate): string {
  if (d === today) return 'Hoje'
  if (d === addDays(today, -1)) return 'Ontem'
  return dayMonthLabel(d)
}
