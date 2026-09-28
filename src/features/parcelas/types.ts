import type { ISODate } from '@/domain/dates'

export type PlanStatus = 'active' | 'settled' | 'refunded'

export interface PlanRow {
  id: string
  totalCents: number
  count: number
  purchasedOn: ISODate
  status: PlanStatus
  closedOn: ISODate | null
}

export type PlanRawRow = {
  id: string
  total_cents: number | string
  installment_count: number
  purchased_on: string
  status: string
  closed_on: string | null
}

export const PLAN_COLUMNS = 'id, total_cents, installment_count, purchased_on, status, closed_on'

export function toPlanRow(r: PlanRawRow): PlanRow {
  return {
    id: r.id,
    totalCents: Number(r.total_cents),
    count: r.installment_count,
    purchasedOn: r.purchased_on,
    status: r.status as PlanStatus,
    closedOn: r.closed_on,
  }
}
