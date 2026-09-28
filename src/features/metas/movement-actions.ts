'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { refreshMoneyViews } from '@/lib/refresh'
import { amountField } from '@/features/registro/schemas'
import { crossedMilestone } from '@/domain/goals'
import { formatBRL } from '@/domain/money'
import { makeUseSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

const recordId = z.uuid()

function messageIncludes(error: unknown, text: string): boolean {
  return typeof error === 'object' && error !== null && 'message' in error && String((error as { message: unknown }).message).includes(text)
}

export async function depositToGoal(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['amount'] as const)
  const parsed = z.object({ amount: amountField }).safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const id = parsedId.data
  const supabase = await createClient()
  const { data: goal } = await supabase
    .from('goals')
    .select('name, target_cents')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_on', null)
    .maybeSingle<{ name: string; target_cents: number }>()
  if (!goal) return errorState({ message: SAVE_FAILED, values })
  const { data, error } = await supabase.rpc('deposit_to_goal', { p_goal_id: id, p_amount_cents: parsed.data.amount })
  if (error) return errorState({ message: SAVE_FAILED, values })
  const after = Number(data)
  const before = after - parsed.data.amount
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

export async function withdrawFromGoal(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const values = readFields(fd, ['amount'] as const)
  const parsed = z.object({ amount: amountField }).safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const id = parsedId.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: parsed.data.amount })
  if (error) {
    if (messageIncludes(error, 'Valor maior que o guardado.')) {
      const { data: balance } = await supabase.rpc('goal_balance', { p_goal_id: id })
      return errorState({
        fieldErrors: { amount: `Esta meta tem ${formatBRL(Number(balance))}. Tire até esse valor.` },
        values,
      })
    }
    return errorState({ message: SAVE_FAILED, values })
  }
  await setFlash('Pronto. O valor voltou para o seu mês.')
  refreshMoneyViews()
  redirect(`/metas/${id}`)
}

export async function spendFromGoal(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const values = readFields(fd, ['amount', 'categoryId'] as const)
  const parsed = makeUseSchema().safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const id = parsedId.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('use_goal', {
    p_goal_id: id,
    p_amount_cents: parsed.data.amountCents,
    p_category_id: parsed.data.categoryId,
  })
  if (error) {
    if (messageIncludes(error, 'Categoria não encontrada.')) {
      return errorState({ fieldErrors: { categoryId: 'Escolha uma categoria para esse gasto.' }, values })
    }
    return errorState({ message: SAVE_FAILED, values })
  }
  refreshMoneyViews()
  const row = (data as { leftover_cents: number | string }[] | null)?.[0]
  const leftover = Number(row?.leftover_cents ?? 0)
  if (leftover > 0) redirect(`/metas/${id}/sobra`)
  await setFlash('Anotado. Seu mês já está atualizado.')
  redirect(`/metas/${id}`)
}

export async function returnLeftover(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/metas')
  const id = parsedId.data
  const supabase = await createClient()
  const { data: balanceData } = await supabase.rpc('goal_balance', { p_goal_id: id })
  const balance = Number(balanceData)
  if (balance <= 0) redirect(`/metas/${id}`)
  const { error } = await supabase.rpc('withdraw_from_goal', { p_goal_id: id, p_amount_cents: balance })
  if (error) redirect(`/metas/${id}?erro=1`)
  await setFlash('Devolvido. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect('/inicio')
}

export async function deleteGoalUse(fd: FormData): Promise<void> {
  await requireUser()
  const parsedTx = recordId.safeParse(String(fd.get('transactionId') ?? ''))
  const parsedGoal = recordId.safeParse(String(fd.get('goalId') ?? ''))
  if (!parsedTx.success || !parsedGoal.success) redirect('/metas')
  const goalId = parsedGoal.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_goal_use', { p_transaction_id: parsedTx.data })
  if (error) redirect(`/metas/${goalId}?erro=1`)
  await setFlash('Excluído. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect(`/metas/${goalId}`)
}
