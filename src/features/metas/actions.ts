'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { refreshMoneyViews } from '@/lib/refresh'
import { todayInSaoPaulo } from '@/domain/dates'
import { familyGoalFailure } from './family-goal-errors'
import { makeGoalSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const GOAL_FIELDS = ['name', 'target', 'deadline'] as const

const recordId = z.uuid()

export async function createGoal(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  // "family" volta nos valores do erro para a caixa "Meta da família" continuar marcada.
  const values = readFields(fd, [...GOAL_FIELDS, 'family'])
  const parsed = makeGoalSchema(today, 'create').safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const d = parsed.data
  const supabase = await createClient()
  // "Meta da família": a família vem do banco (auth.uid()); o formulário só diz "sim" ou "não".
  if (fd.get('family') === 'on') {
    const { error: familyError } = await supabase.rpc('create_family_goal', {
      p_name: d.name,
      p_target_cents: d.targetCents,
      p_deadline: d.deadline ? `${d.deadline}-01` : null,
    })
    if (familyError) return errorState({ message: familyGoalFailure(familyError), values })
    await setFlash('Meta criada. O primeiro passo já foi dado.')
    refreshMoneyViews()
    redirect('/metas')
  }
  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: user.id,
      name: d.name,
      target_cents: d.targetCents,
      deadline: d.deadline ? `${d.deadline}-01` : null,
    })
    .select('id')
    .single()
  if (error || !data) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Meta criada. O primeiro passo já foi dado.')
  refreshMoneyViews()
  redirect(`/metas/${data.id}`)
}

export async function updateGoal(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  const values = readFields(fd, GOAL_FIELDS)
  const parsed = makeGoalSchema(today, 'edit').safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const d = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('goals')
    .update({ name: d.name, target_cents: d.targetCents, deadline: d.deadline ? `${d.deadline}-01` : null })
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .is('deleted_on', null)
    .select('id')
  if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Alterações salvas.')
  refreshMoneyViews()
  redirect(`/metas/${parsedId.data}`)
}

export async function deleteGoal(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/metas')
  const id = parsedId.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_goal', { p_goal_id: id })
  if (error) redirect(`/metas/${id}/editar?erro=1`)
  await setFlash('Meta excluída.')
  refreshMoneyViews()
  redirect('/metas')
}
