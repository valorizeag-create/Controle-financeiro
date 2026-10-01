'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { refreshMoneyViews } from '@/lib/refresh'
import { amountField } from '@/features/registro/schemas'
import { UNEXPECTED } from '@/features/auth/errors'
import { myFamilyId } from '@/features/familia/queries'
import { crossedMilestone } from '@/domain/goals'
import { formatBRL } from '@/domain/money'
import { todayInSaoPaulo } from '@/domain/dates'
import { makeGoalSchema, makeUseSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const UNDO_BLOCKED = 'Não dá para desfazer este uso porque alguém que participou saiu da família.'
const GOAL_FIELDS = ['name', 'target', 'deadline'] as const

const recordId = z.uuid()

type DbError = { message?: string; code?: string }

// As regras de quem pode (administrador, quem criou) e a família vêm do banco (auth.uid()):
// daqui só vai o que a pessoa digitou. Impasse entre gravações ao mesmo tempo (40P01): tentar de novo funciona.
const says = (e: DbError, part: string) => (e.message ?? '').includes(part)
const failure = (e: DbError) => (e.code === '40P01' ? UNEXPECTED : SAVE_FAILED)

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
  if (error) return errorState({ message: failure(error), values })
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
  if (error) redirect(`/metas/${id}/editar?erro=1`)
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
    familyId = null
  }
  if (!familyId) return errorState({ message: SAVE_FAILED, values })
  // O aviso de marco é sobre o total da família (A4 B: o total é de todos; a parte de cada um é só dele).
  const [goalRes, totalsRes] = await Promise.all([
    supabase
      .from('goals')
      .select('name, target_cents')
      .eq('id', id)
      .eq('family_id', familyId)
      .is('deleted_on', null)
      .maybeSingle<{ name: string; target_cents: number }>(),
    supabase.rpc('family_goal_totals'),
  ])
  const goal = goalRes.data
  if (!goal || totalsRes.error) return errorState({ message: SAVE_FAILED, values })
  const totals = (totalsRes.data ?? []) as { goal_id: string; saved_cents: number | string }[]
  const before = Number(totals.find((t) => t.goal_id === id)?.saved_cents ?? 0)
  const { error } = await supabase.rpc('deposit_family_goal', { p_goal_id: id, p_amount_cents: parsed.data.amount })
  if (error) return errorState({ message: failure(error), values })
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
      const { data: balance } = await supabase.rpc('goal_balance', { p_goal_id: id })
      return errorState({
        fieldErrors: { amount: `Sua parte nesta meta é ${formatBRL(Number(balance))}. Tire até esse valor.` },
        values,
      })
    }
    return errorState({ message: failure(error), values })
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
    return errorState({ message: failure(error), values })
  }
  await setFlash('Anotado. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect(`/metas/${id}`)
}

export async function deleteFamilyGoalUse(fd: FormData): Promise<void> {
  await requireUser()
  const parsedTx = recordId.safeParse(String(fd.get('transactionId') ?? ''))
  const parsedGoal = recordId.safeParse(String(fd.get('goalId') ?? ''))
  if (!parsedTx.success || !parsedGoal.success) redirect('/metas')
  const goalId = parsedGoal.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_family_goal_use', { p_transaction_id: parsedTx.data })
  if (error) {
    // O banco recusa com "Gasto não encontrado." quando alguém do uso já saiu; a tela não tem como saber antes.
    if (says(error, 'Gasto não encontrado.')) {
      await setFlash(UNDO_BLOCKED)
      redirect(`/metas/${goalId}`)
    }
    redirect(`/metas/${goalId}?erro=1`)
  }
  await setFlash('Excluído. Seu mês já está atualizado.')
  refreshMoneyViews()
  // O RPC devolve a meta de verdade; o campo do formulário é só o que a tela tinha na hora.
  redirect(`/metas/${String(data)}`)
}
