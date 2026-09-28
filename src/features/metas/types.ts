import type { ISODate, MonthKey } from '@/domain/dates'
import type { GoalMovement } from '@/domain/summary'

export type GoalStatus = 'active' | 'used'

export interface GoalRow {
  id: string
  name: string
  targetCents: number
  deadline: MonthKey | null
  status: GoalStatus
  usedOn: ISODate | null
  deletedOn: ISODate | null
  createdAt: string
}

export type GoalRawRow = {
  id: string
  name: string
  target_cents: number | string
  deadline: string | null
  status: string
  used_on: string | null
  deleted_on: string | null
  created_at: string
}

export const GOAL_COLUMNS = 'id, name, target_cents, deadline, status, used_on, deleted_on, created_at'

export function toGoalRow(r: GoalRawRow): GoalRow {
  return {
    id: r.id,
    name: r.name,
    targetCents: Number(r.target_cents),
    deadline: r.deadline === null ? null : r.deadline.slice(0, 7),
    status: r.status as GoalStatus,
    usedOn: r.used_on,
    deletedOn: r.deleted_on,
    createdAt: r.created_at,
  }
}

export interface GoalMovementRow extends GoalMovement {
  id: string
  goalId: string
  transactionId: string | null
  createdAt: string
}

export type GoalMovementRawRow = {
  id: string
  goal_id: string
  kind: string
  amount_cents: number | string
  occurred_on: string
  transaction_id: string | null
  created_at: string
}

export const MOVEMENT_COLUMNS = 'id, goal_id, kind, amount_cents, occurred_on, transaction_id, created_at'

export function toMovementRow(r: GoalMovementRawRow): GoalMovementRow {
  return {
    id: r.id,
    goalId: r.goal_id,
    kind: r.kind as GoalMovementRow['kind'],
    amountCents: Number(r.amount_cents),
    occurredOn: r.occurred_on,
    transactionId: r.transaction_id,
    createdAt: r.created_at,
  }
}
