import { monthOf, monthsBetween, type ISODate, type MonthKey } from './dates'
import type { Cents } from './money'
import type { GoalMovement } from './summary'

export const MAX_GOAL_NAME = 40

export function goalBalance(moves: Pick<GoalMovement, 'kind' | 'amountCents'>[]): Cents {
  return moves.reduce((total, m) => (m.kind === 'deposit' ? total + m.amountCents : total - m.amountCents), 0)
}

export interface GoalProgress {
  percent: number
  remainingCents: Cents
  complete: boolean
}

export function goalProgress(balanceCents: Cents, targetCents: Cents): GoalProgress {
  const percent = Math.min(100, Math.floor((balanceCents * 100) / targetCents))
  const remainingCents = Math.max(0, targetCents - balanceCents)
  const complete = balanceCents >= targetCents
  return { percent, remainingCents, complete }
}

export function monthlySuggestion(input: { remainingCents: Cents; deadline: MonthKey | null; today: ISODate }): Cents | null {
  const { remainingCents, deadline, today } = input
  if (deadline === null || remainingCents === 0) return null
  const currentMonth = monthOf(today)
  if (deadline < currentMonth) return null
  const months = Math.max(1, monthsBetween(currentMonth, deadline))
  return Math.ceil(Math.ceil(remainingCents / months) / 100) * 100
}

export interface GoalUseSplit {
  fundedCents: Cents
  fromMonthCents: Cents
  leftoverCents: Cents
}

export function splitGoalUse(amountCents: Cents, balanceCents: Cents): GoalUseSplit {
  const fundedCents = Math.min(amountCents, balanceCents)
  const fromMonthCents = amountCents - fundedCents
  const leftoverCents = balanceCents - fundedCents
  return { fundedCents, fromMonthCents, leftoverCents }
}

export type GoalMilestone = 'half' | 'complete' | null

export function crossedMilestone(beforeCents: Cents, afterCents: Cents, targetCents: Cents): GoalMilestone {
  if (beforeCents < targetCents && targetCents <= afterCents) return 'complete'
  if (beforeCents * 2 < targetCents && targetCents <= afterCents * 2) return 'half'
  return null
}
