'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { refreshMoneyViews } from '@/lib/refresh'
import { formatBRL } from '@/domain/money'
import { monthOf, todayInSaoPaulo } from '@/domain/dates'
import { amountField } from '@/features/registro/schemas'
import { safeReturnPath } from './return-path'

export const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

const recordId = z.uuid()

export async function markBillPaid(fd: FormData): Promise<void> {
  const user = await requireUser()
  const volta = safeReturnPath(String(fd.get('volta') ?? ''))
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect(volta)
  const id = parsedId.data
  const today = todayInSaoPaulo()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .update({ status: 'confirmed', paid_on: today })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('kind', 'expense')
    .eq('status', 'pending')
    .select()
  if (error) redirect('/contas?erro=1')
  if (!data || data.length !== 1) redirect(volta)
  await setFlash('Conta marcada como paga.')
  refreshMoneyViews()
  redirect(volta)
}

export async function confirmIncome(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  const values = readFields(fd, ['amount'] as const)
  const parsed = z.object({ amount: amountField }).safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const id = parsedId.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .update({ status: 'confirmed', paid_on: today, amount_cents: parsed.data.amount })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('kind', 'income')
    .eq('status', 'pending')
    .select()
  if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })
  await setFlash(`Anotado. Mais ${formatBRL(parsed.data.amount)} no seu mês.`)
  refreshMoneyViews()
  redirect(`/contas?mes=${monthOf(today)}`)
}
