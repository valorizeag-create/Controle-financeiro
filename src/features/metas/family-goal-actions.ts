'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { refreshMoneyViews } from '@/lib/refresh'
import { amountField } from '@/features/registro/schemas'
import { myFamilyId } from '@/features/familia/queries'
import { crossedMilestone } from '@/domain/goals'
import { formatBRL } from '@/domain/money'
import { todayInSaoPaulo } from '@/domain/dates'
import { makeGoalSchema, makeUseSchema } from './schemas'
import { GOAL_CHANGED, SAVE_FAILED, UNDO_BLOCKED, familyGoalFailure, isFinalFailure } from './family-goal-errors'

const GOAL_FIELDS = ['name', 'target', 'deadline'] as const

const recordId = z.uuid()

const says = (e: { message?: string }, part: string) => (e.message ?? '').includes(part)

// As regras de quem pode (administrador, quem criou) e a família vêm do banco (auth.uid()):
// daqui só vai o que a pessoa digitou. Os textos de cada erro ficam em family-goal-errors.ts.

export async function updateFamilyGoal(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const values = readFields(fd, GOAL_FIELDS)
  const parsed = makeGoalSchema(todayInSaoPaulo(), 'edit').safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_family_goal', {
    p_id: parsedId.data,
    p_name: d.name,
    p_target_cents: d.targetCents,
    p_deadline: d.deadline ? `${d.deadline}-01` : null,
  })
  if (error) return errorState({ message: familyGoalFailure(error), values })
  await setFlash('Alterações salvas.')
  refreshMoneyViews()
  redirect(`/metas/${parsedId.data}`)
}

export async function deleteFamilyGoal(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/metas')
  const id = parsedId.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_family_goal', { p_goal_id: id })
  if (error) {
    // Erro que tentar de novo não resolve: o texto certo vai no aviso, de volta à meta (ou à lista, se ela sumiu).
    const message = familyGoalFailure(error)
    if (isFinalFailure(message)) {
      await setFlash(message)
      redirect(message === GOAL_CHANGED ? '/metas' : `/metas/${id}`)
    }
    redirect(`/metas/${id}/editar?erro=1`)
  }
  await setFlash('Meta excluída.')
  refreshMoneyViews()
  redirect('/metas')
}

export async function depositToFamilyGoal(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['amount'] as const)
  const parsed = z.object({ amount: amountField }).safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const id = parsedId.data
  const supabase = await createClient()
  let familyId: string | null
  try {
    familyId = await myFamilyId(supabase, user.id)
  } catch {
    return errorState({ message: SAVE_FAILED, values })
  }
  if (!familyId) return errorState({ message: GOAL_CHANGED, values })
  // O aviso de marco é sobre o total da família (A4 B: o total é de todos; a parte de cada um é só dele).
  // O total é lido antes de guardar: se outro membro guardar ao mesmo tempo, o aviso pode variar. É só o aviso.
  const [goalRes, totalsRes] = await Promise.all([
    supabase
      .from('goals')
      .select('name, target_cents')
      .eq('id', id)
      .eq('family_id', familyId)
      .eq('status', 'active')
      .is('deleted_on', null)
      .maybeSingle<{ name: string; target_cents: number }>(),
    supabase.rpc('family_goal_totals'),
  ])
  if (goalRes.error || totalsRes.error) return errorState({ message: SAVE_FAILED, values })
  const goal = goalRes.data
  if (!goal) return errorState({ message: GOAL_CHANGED, values })
  const totals = (totalsRes.data ?? []) as { goal_id: string; saved_cents: number | string }[]
  const before = Number(totals.find((t) => t.goal_id === id)?.saved_cents ?? 0)
  const { error } = await supabase.rpc('deposit_family_goal', { p_goal_id: id, p_amount_cents: parsed.data.amount })
  if (error) return errorState({ message: familyGoalFailure(error), values })
  const after = before + parsed.data.amount
  const milestone = crossedMilestone(before, after, Number(goal.target_cents))
  const message =
    milestone === 'complete'
      ? `Você chegou lá. ${goal.name} está completa.`
      : milestone === 'half'
        ? `Metade do caminho até ${goal.name}.`
        : 'Guardado. Seu mês já está atualizado.'
  await setFlash(message)
  refreshMoneyViews()
  redirect(`/metas/${id}`)
}

export async function withdrawFromFamilyGoal(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const values = readFields(fd, ['amount'] as const)
  const parsed = z.object({ amount: amountField }).safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const id = parsedId.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('withdraw_family_goal', { p_goal_id: id, p_amount_cents: parsed.data.amount })
  if (error) {
    if (says(error, 'Valor maior que o guardado.')) {
      // goal_balance devolve só a parte de quem pede.
      const { data: balance, error: balanceError } = await supabase.rpc('goal_balance', { p_goal_id: id })
      if (balanceError || balance === null || balance === undefined) return errorState({ message: SAVE_FAILED, values })
      return errorState({
        fieldErrors: { amount: `Sua parte nesta meta é ${formatBRL(Number(balance))}. Tire até esse valor.` },
        values,
      })
    }
    return errorState({ message: familyGoalFailure(error), values })
  }
  await setFlash('Pronto. O valor voltou para o seu mês.')
  refreshMoneyViews()
  redirect(`/metas/${id}`)
}

// Só o administrador usa a meta (o banco confere). Sem a pergunta da sobra: cada um tira a sua (decisão 105).
export async function spendFromFamilyGoal(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const values = readFields(fd, ['amount', 'categoryId'] as const)
  const parsed = makeUseSchema().safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const id = parsedId.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('use_family_goal', {
    p_goal_id: id,
    p_amount_cents: parsed.data.amountCents,
    p_category_id: parsed.data.categoryId,
  })
  if (error) {
    if (says(error, 'Categoria não encontrada.')) {
      return errorState({ fieldErrors: { categoryId: 'Escolha uma categoria para esse gasto.' }, values })
    }
    return errorState({ message: familyGoalFailure(error), values })
  }
  await setFlash('Anotado. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect(`/metas/${id}`)
}

export async function deleteFamilyGoalUse(fd: FormData): Promise<void> {
  await requireUser()
  const parsedTx = recordId.safeParse(String(fd.get('transactionId') ?? ''))
  if (!parsedTx.success) redirect('/metas')
  // A meta do formulário só serve para voltar na falha; sem ela, volta para a lista.
  const parsedGoal = recordId.safeParse(String(fd.get('goalId') ?? ''))
  const back = parsedGoal.success ? `/metas/${parsedGoal.data}` : '/metas'
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_family_goal_use', { p_transaction_id: parsedTx.data })
  if (error) {
    // "Gasto não encontrado." vale para uso já desfeito (toque duplo), de outra família ou de quem saiu:
    // o banco não distingue, então o texto não afirma a causa.
    if (says(error, 'Gasto não encontrado.')) {
      await setFlash(UNDO_BLOCKED)
      redirect(back)
    }
    const message = familyGoalFailure(error)
    if (isFinalFailure(message)) {
      await setFlash(message)
      redirect(message === GOAL_CHANGED ? '/metas' : back)
    }
    redirect(`${back}?erro=1`)
  }
  await setFlash('Excluído. Seu mês já está atualizado.')
  refreshMoneyViews()
  // O RPC devolve a meta de verdade; o campo do formulário é só o que a tela tinha na hora.
  redirect(`/metas/${String(data)}`)
}
