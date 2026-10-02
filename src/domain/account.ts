import type { Cents } from './money'
import { goalBalance } from './goals'
import type { GoalMovementKind } from './summary'

export const DELETE_WORD = 'EXCLUIR'

export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_WORD
}

export function familyShareCents(
  familyGoalIds: string[],
  movements: { goalId: string; kind: GoalMovementKind; amountCents: Cents }[],
): Cents {
  const byGoal = new Map<string, { kind: GoalMovementKind; amountCents: Cents }[]>()
  for (const m of movements) {
    const list = byGoal.get(m.goalId)
    if (list) list.push(m)
    else byGoal.set(m.goalId, [m])
  }
  let total = 0
  for (const id of familyGoalIds) {
    const balance = goalBalance(byGoal.get(id) ?? [])
    if (balance > 0) total += balance
  }
  return total
}

export type DeletionNotice = 'everything' | 'family-history'

export function deletionNotice(input: {
  hasCurrentFamilyTx: boolean
  hasOtherFamilyTx: boolean
  activeMembers: number
}): DeletionNotice {
  if (input.hasOtherFamilyTx) return 'family-history'
  if (input.hasCurrentFamilyTx && input.activeMembers > 1) return 'family-history'
  return 'everything'
}
