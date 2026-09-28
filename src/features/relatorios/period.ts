import { addMonths, monthOf, monthsBetween, parseMonthKey, type ISODate, type MonthKey } from '@/domain/dates'

export type PeriodKey = 'este-mes' | 'mes-passado' | '3-meses' | 'personalizado'

export const MAX_PERIOD_MONTHS = 12
export const PERIOD_ERROR = 'Escolha um período de até 12 meses.'

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'este-mes', label: 'Este mês' },
  { key: 'mes-passado', label: 'Mês passado' },
  { key: '3-meses', label: 'Últimos 3 meses' },
  { key: 'personalizado', label: 'Personalizado' },
]

export interface Period {
  key: PeriodKey
  from: MonthKey
  to: MonthKey
  months: MonthKey[]
  error: string | null
}

function range(from: MonthKey, to: MonthKey): MonthKey[] {
  return Array.from({ length: monthsBetween(from, to) + 1 }, (_, i) => addMonths(from, i))
}

function build(key: PeriodKey, from: MonthKey, to: MonthKey, error: string | null = null): Period {
  return { key, from, to, months: range(from, to), error }
}

export function resolvePeriod(params: { periodo?: string; de?: string; ate?: string }, today: ISODate): Period {
  const current = monthOf(today)
  const lastThree = () => [addMonths(current, -2), current] as const
  switch (params.periodo) {
    case 'este-mes':
      return build('este-mes', current, current)
    case 'mes-passado': {
      const prev = addMonths(current, -1)
      return build('mes-passado', prev, prev)
    }
    case 'personalizado': {
      const de = params.de ?? ''
      const ate = params.ate ?? ''
      if (de === '' && ate === '') return build('personalizado', ...lastThree())
      const from = parseMonthKey(de)
      const to = parseMonthKey(ate)
      if (from && to) {
        const span = monthsBetween(from, to)
        if (span >= 0 && span < MAX_PERIOD_MONTHS) return build('personalizado', from, to)
      }
      return build('personalizado', ...lastThree(), PERIOD_ERROR)
    }
    default:
      return build('3-meses', ...lastThree())
  }
}

export function periodHref(key: PeriodKey): string {
  return `/relatorios?periodo=${key}`
}
