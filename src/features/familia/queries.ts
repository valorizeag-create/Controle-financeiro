import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { unstable_rethrow } from 'next/navigation'
import { createClient, requireUser } from '@/lib/supabase/server'
import { fetchAllPages } from '@/features/registro/paging'
import { ensureOccurrences } from '@/features/contas/occurrences'
import { MOVEMENT_COLUMNS, toMovementRow, type GoalMovementRawRow, type GoalMovementRow } from '@/features/metas/types'
import { dueDateIn } from '@/domain/recurrence'
import type { MonthKey } from '@/domain/dates'
import {
  EVENT_COLUMNS,
  FAMILY_GOAL_COLUMNS,
  INVITE_COLUMNS,
  MEMBER_COLUMNS,
  toEventRow,
  toFamilyBillRow,
  toFamilyExpenseRow,
  toFamilyGoalRow,
  toFamilyRecurrenceRow,
  toInviteRow,
  toMemberRow,
  type FamilyBillRawRow,
  type FamilyBillRow,
  type FamilyEventRawRow,
  type FamilyExpenseRawRow,
  type FamilyExpenseRow,
  type FamilyGoalRawRow,
  type FamilyGoalRow,
  type FamilyRecurrenceRawRow,
  type FamilyRecurrenceRow,
  type FamilyRole,
  type InviteRawRow,
  type MemberRawRow,
  type MyFamily,
} from './types'

// A família da pessoa (participação ativa), ou null. Os dados dos outros membros
// só chegam pelas funções do banco (RPC), que conferem a participação de novo.
export async function myFamilyId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle<{ family_id: string }>()
  if (error) throw error
  return data?.family_id ?? null
}

export async function loadMyFamily(): Promise<MyFamily | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const familyId = await myFamilyId(supabase, user.id)
  if (!familyId) return null

  const [family, members, events] = await Promise.all([
    supabase.from('families').select('id, name').eq('id', familyId).maybeSingle<{ id: string; name: string }>(),
    supabase.from('family_members').select(MEMBER_COLUMNS).eq('family_id', familyId).order('joined_at'),
    supabase.from('family_events').select(EVENT_COLUMNS).eq('family_id', familyId).order('created_at', { ascending: false }).limit(5),
  ])
  if (family.error) throw family.error
  if (members.error) throw members.error
  if (events.error) throw events.error
  if (!family.data) return null

  const memberRows = (members.data as MemberRawRow[]).map(toMemberRow)
  const me = memberRows.find((m) => m.userId === user.id && m.leftAt === null)
  if (!me) return null

  // Convites: só o administrador (a regra do banco também só mostra a ele).
  let invites: MyFamily['invites'] = []
  if (me.role === 'admin') {
    const res = await supabase
      .from('family_invites')
      .select(INVITE_COLUMNS)
      .eq('family_id', familyId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at')
    if (res.error) throw res.error
    invites = (res.data as InviteRawRow[]).map(toInviteRow)
  }

  return {
    id: family.data.id,
    name: family.data.name,
    meId: user.id,
    role: me.role,
    members: memberRows,
    invites,
    events: (events.data as FamilyEventRawRow[]).map(toEventRow),
  }
}

export async function loadFamilySummary(): Promise<{ id: string; name: string; role: FamilyRole } | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const mine = await supabase
    .from('family_members')
    .select('family_id, role')
    .eq('user_id', user.id)
    .is('left_at', null)
    .maybeSingle<{ family_id: string; role: string }>()
  if (mine.error) throw mine.error
  if (!mine.data) return null
  const family = await supabase.from('families').select('id, name').eq('id', mine.data.family_id).maybeSingle<{ id: string; name: string }>()
  if (family.error) throw family.error
  if (!family.data) return null
  return { id: family.data.id, name: family.data.name, role: mine.data.role as FamilyRole }
}

// Para o Seu mês: uma falha ao ler a família não derruba a tela pessoal, que só
// fica sem o seletor Eu · Família. O erro vai para o registro do servidor, para
// uma falha persistente ser notada: só o código e a mensagem do banco, nada da
// pessoa. Redirecionamentos do Next (sessão vencida) seguem o caminho deles.
export async function loadFamilySummaryOrNull(): Promise<{ id: string; name: string; role: FamilyRole } | null> {
  try {
    return await loadFamilySummary()
  } catch (e) {
    unstable_rethrow(e)
    const err = (typeof e === 'object' && e !== null ? e : {}) as { code?: unknown; message?: unknown }
    console.error('loadFamilySummary', { code: err.code ?? null, message: err.message ?? null })
    return null
  }
}

// Cartão nunca aparece nas leituras da família (RN-31): o banco nem devolve a coluna.
export async function loadFamilyExpenses(month: MonthKey): Promise<FamilyExpenseRow[]> {
  await requireUser()
  const supabase = await createClient()
  const rows = await fetchAllPages<FamilyExpenseRawRow>(async (from, to) => {
    const { data, error } = await supabase
      .rpc('family_expenses', { p_from: `${month}-01`, p_to: dueDateIn(month, 31) })
      .range(from, to)
    return { data: data as FamilyExpenseRawRow[] | null, error }
  })
  return rows.map(toFamilyExpenseRow)
}

export async function loadFamilyExpense(id: string): Promise<FamilyExpenseRow | null> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('family_expense', { p_id: id })
  if (error) throw error
  const row = (data as FamilyExpenseRawRow[] | null)?.find((r) => r.id === id)
  return row ? toFamilyExpenseRow(row) : null
}

export async function loadFamilyRecurrences(): Promise<FamilyRecurrenceRow[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('family_recurrences')
  if (error) throw error
  return ((data ?? []) as FamilyRecurrenceRawRow[]).map(toFamilyRecurrenceRow)
}

export async function loadFamilyBills(): Promise<FamilyBillRow[]> {
  await requireUser()
  const supabase = await createClient()
  await ensureOccurrences(supabase)
  const { data, error } = await supabase.rpc('family_bills')
  if (error) throw error
  return ((data ?? []) as FamilyBillRawRow[]).map(toFamilyBillRow)
}

async function loadFamilyGoalTotals(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('family_goal_totals')
  if (error) throw error
  return new Map(((data ?? []) as { goal_id: string; saved_cents: number | string }[]).map((t) => [t.goal_id, Number(t.saved_cents)]))
}

export async function loadFamilyGoals(familyId: string): Promise<FamilyGoalRow[]> {
  await requireUser()
  const supabase = await createClient()
  const [goals, totals] = await Promise.all([
    supabase.from('goals').select(FAMILY_GOAL_COLUMNS).eq('family_id', familyId).is('deleted_on', null).order('created_at').order('id'),
    loadFamilyGoalTotals(supabase),
  ])
  if (goals.error) throw goals.error
  return (goals.data as unknown as FamilyGoalRawRow[]).map((g) => toFamilyGoalRow(g, totals.get(g.id) ?? 0))
}

// A4 B: todos veem o total da meta; os movimentos (a parte de cada um) são só de quem pede.
export async function loadFamilyGoal(
  id: string,
  familyId: string,
): Promise<{ goal: FamilyGoalRow; movements: GoalMovementRow[] } | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const [goal, movements, totals] = await Promise.all([
    supabase
      .from('goals')
      .select(FAMILY_GOAL_COLUMNS)
      .eq('id', id)
      .eq('family_id', familyId)
      .is('deleted_on', null)
      .maybeSingle<FamilyGoalRawRow>(),
    supabase
      .from('goal_movements')
      .select(MOVEMENT_COLUMNS)
      .eq('goal_id', id)
      .eq('user_id', user.id)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
    loadFamilyGoalTotals(supabase),
  ])
  if (goal.error) throw goal.error
  if (movements.error) throw movements.error
  if (!goal.data) return null
  return {
    goal: toFamilyGoalRow(goal.data, totals.get(id) ?? 0),
    movements: (movements.data as GoalMovementRawRow[]).map(toMovementRow),
  }
}
