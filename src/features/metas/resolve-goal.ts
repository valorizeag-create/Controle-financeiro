import 'server-only'
import { loadMyFamily, loadFamilyGoal } from '@/features/familia/queries'
import type { FamilyGoalRow } from '@/features/familia/types'
import { loadGoal } from './queries'
import type { GoalMovementRow, GoalRow } from './types'

export type ResolvedGoal =
  | { kind: 'personal'; goal: GoalRow; movements: GoalMovementRow[] }
  | { kind: 'family'; goal: FamilyGoalRow; movements: GoalMovementRow[]; isAdmin: boolean; canEdit: boolean }

// As telas de uma meta servem a meta pessoal e, se não houver, a da família de quem pede.
// A meta pessoal vem primeiro (loadGoal filtra o dono); a da família só é buscada na família da pessoa
// (loadFamilyGoal filtra a família e devolve só os movimentos de quem pede).
export async function resolveGoal(id: string): Promise<ResolvedGoal | null> {
  const personal = await loadGoal(id)
  if (personal) return { kind: 'personal', ...personal }
  const family = await loadMyFamily()
  if (!family) return null
  const data = await loadFamilyGoal(id, family.id)
  if (!data) return null
  const isAdmin = family.role === 'admin'
  return { kind: 'family', ...data, isAdmin, canEdit: isAdmin || data.goal.createdBy === family.meId }
}
