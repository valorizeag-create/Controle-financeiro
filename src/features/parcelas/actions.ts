'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { refreshMoneyViews } from '@/lib/refresh'
import { amountField } from '@/features/registro/schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

const recordId = z.uuid()

export async function settlePurchase(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const values = readFields(fd, ['amount'] as const)
  const parsed = z.object({ amount: amountField }).safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const id = parsedId.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('settle_installments', { p_plan_id: id, p_amount_cents: parsed.data.amount })
  if (error) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Parcelas quitadas. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect(`/extrato/parcelas/${id}`)
}

export async function refundPurchase(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/extrato')
  const id = parsedId.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('refund_installments', { p_plan_id: id })
  if (error) redirect(`/extrato/parcelas/${id}?erro=1`)
  await setFlash('Parcelas canceladas. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect(`/extrato/parcelas/${id}`)
}

export async function deletePurchase(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/extrato')
  const id = parsedId.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_installment_purchase', { p_plan_id: id })
  if (error) redirect(`/extrato/parcelas/${id}?erro=1`)
  await setFlash('Excluído. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect('/extrato')
}
