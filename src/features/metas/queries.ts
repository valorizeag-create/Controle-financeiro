import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, requireUser } from '@/lib/supabase/server'
import { fetchAllPages } from '@/features/registro/paging'
import {
  GOAL_COLUMNS,
  MOVEMENT_COLUMNS,
  toGoalRow,
  toMovementRow,
  type GoalMovementRawRow,
  type GoalMovementRow,
  type GoalRawRow,
  type GoalRow,
} from './types'

export async function fetchGoalMovements(supabase: SupabaseClient, userId: string): Promise<GoalMovementRow[]> {
  const rows = await fetchAllPages<GoalMovementRawRow>(async (from, to) => {
    const { data, error } = await supabase
      .from('goal_movements')
      .select(MOVEMENT_COLUMNS)
      .eq('user_id', userId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
    return { data, error }
  })
  return rows.map(toMovementRow)
}

export async function loadGoalMovements(): Promise<GoalMovementRow[]> {
  const user = await requireUser()
  const supabase = await createClient()
  return fetchGoalMovements(supabase, user.id)
}

export async function loadGoals(): Promise<GoalRow[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('goals')
    .select(GOAL_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at')
    .order('id')
  if (error) throw error
  return (data as GoalRawRow[]).map(toGoalRow)
}

export async function loadGoal(id: string): Promise<{ goal: GoalRow; movements: GoalMovementRow[] } | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const [goal, movements] = await Promise.all([
    supabase.from('goals').select(GOAL_COLUMNS).eq('id', id).eq('user_id', user.id).is('deleted_on', null).maybeSingle<GoalRawRow>(),
    supabase
      .from('goal_movements')
      .select(MOVEMENT_COLUMNS)
      .eq('goal_id', id)
      .eq('user_id', user.id)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ])
  if (goal.error) throw goal.error
  if (movements.error) throw movements.error
  if (!goal.data) return null
  return { goal: toGoalRow(goal.data), movements: (movements.data as GoalMovementRawRow[]).map(toMovementRow) }
}
