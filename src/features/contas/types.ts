import type { ISODate } from '@/domain/dates'
import type { RecurrenceRule } from '@/domain/recurrence'

export interface RecurrenceRow extends RecurrenceRule {
  id: string
  kind: 'income' | 'expense'
  name: string
  amountCents: number
  categoryId: string | null
  source: string | null
  startsOn: ISODate
  endedOn: ISODate | null
}

export type RecurrenceRawRow = {
  id: string
  kind: string
  name: string
  amount_cents: number | string
  category_id: string | null
  source: string | null
  frequency: string
  due_day: number
  due_month: number | null
  starts_on: string
  ended_on: string | null
}

export const RECURRENCE_COLUMNS = 'id, kind, name, amount_cents, category_id, source, frequency, due_day, due_month, starts_on, ended_on'

export function toRecurrenceRow(r: RecurrenceRawRow): RecurrenceRow {
  return {
    id: r.id,
    kind: r.kind as 'income' | 'expense',
    name: r.name,
    amountCents: Number(r.amount_cents),
    categoryId: r.category_id,
    source: r.source,
    frequency: r.frequency as RecurrenceRule['frequency'],
    dueDay: Number(r.due_day),
    dueMonth: r.due_month === null ? null : Number(r.due_month),
    startsOn: r.starts_on,
    endedOn: r.ended_on,
  }
}
