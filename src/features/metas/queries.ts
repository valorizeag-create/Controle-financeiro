import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, requireUser } from '@/lib/supabase/server'
import { myFamilyId } from '@/features/familia/queries'
import { fetchAllPages } from '@/features/registro/paging'
import type { ISODate } from '@/domain/dates'
import {
  GOAL_COLUMNS,
  MOVEMENT_COLUMNS,
  toGoalRow,
  toMovementRow,
  type GoalMovementRawRow,
  type GoalMovementRow,
  type GoalUseTx,
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

// Os usos da meta da família que o administrador fez (o gasto de cada uso é do administrador que usou).
// Só linhas da própria pessoa; não lê nada dos outros membros nem as partes. Serve para o administrador
// desfazer um uso mesmo quando ele não tem parte (o uso só grava movimento de quem tinha parte).
export async function loadMyGoalUses(goalId: string): Promise<GoalUseTx[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount_cents, occurred_on')
    .eq('user_id', user.id)
    .eq('goal_id', goalId)
    .eq('kind', 'expense')
    .eq('status', 'confirmed')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as { id: string; amount_cents: number | string; occurred_on: string }[]).map((t) => ({
    id: t.id,
    amountCents: Number(t.amount_cents),
    occurredOn: t.occurred_on,
  }))
}

// Metas da família com as excluídas: só para dar nome às linhas do Extrato da própria pessoa (M-3).
// A RLS só devolve as da família de quem pede.
export async function loadFamilyGoalLabels(familyId: string): Promise<GoalRow[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('goals').select(GOAL_COLUMNS).eq('family_id', familyId)
  if (error) throw error
  return (data as GoalRawRow[]).map(toGoalRow)
}

// Só o nome e se está excluída, mesmo para uma meta excluída (M-3): usado
// para rotular no Extrato um gasto pago com uma meta que já não tem mais
// tela própria. loadGoal() não serve aqui porque filtra deleted_on is null.
export async function loadGoalLabel(id: string): Promise<{ name: string; deletedOn: ISODate | null } | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('goals')
    .select('name, deleted_on')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<{ name: string; deleted_on: string | null }>()
  if (error) throw error
  if (data) return { name: data.name, deletedOn: data.deleted_on }
  // Não é pessoal: pode ser meta da família de quem pede (um gasto pago com ela).
  const familyId = await myFamilyId(supabase, user.id)
  if (!familyId) return null
  const family = await supabase
    .from('goals')
    .select('name, deleted_on')
    .eq('id', id)
    .eq('family_id', familyId)
    .maybeSingle<{ name: string; deleted_on: string | null }>()
  if (family.error) throw family.error
  return family.data ? { name: family.data.name, deletedOn: family.data.deleted_on } : null
}
