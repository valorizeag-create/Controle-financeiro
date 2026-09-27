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
import { nextDueOnOrAfter } from '@/domain/recurrence'
import { safeReturnPath } from './return-path'
import { billSchema, makeRecurrenceEditSchema } from './schemas'

export const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

const recordId = z.uuid()
const BILL_FIELDS = ['name', 'amount', 'categoryId', 'frequency', 'dueDay', 'dueMonth'] as const
const EDIT_FIELDS = ['name', 'amount', 'categoryId', 'source', 'dueDay'] as const

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

export async function createBill(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  const values = readFields(fd, BILL_FIELDS)
  const parsed = billSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('recurrences').insert({
    user_id: user.id,
    kind: 'expense',
    name: d.name,
    amount_cents: d.amountCents,
    category_id: d.categoryId,
    frequency: d.frequency,
    due_day: d.dueDay,
    due_month: d.dueMonth,
    starts_on: nextDueOnOrAfter({ frequency: d.frequency, dueDay: d.dueDay, dueMonth: d.dueMonth }, today),
  })
  if (error) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Conta criada.')
  refreshMoneyViews()
  redirect('/contas')
}

export async function updateRecurrence(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, EDIT_FIELDS)
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  const supabase = await createClient()

  const existing = parsedId.success
    ? (
        await supabase
          .from('recurrences')
          .select('kind')
          .eq('id', parsedId.data)
          .eq('user_id', user.id)
          .is('ended_on', null)
          .maybeSingle<{ kind: 'income' | 'expense' }>()
      ).data
    : null
  if (!parsedId.success || !existing) return errorState({ message: SAVE_FAILED, values })

  const parsed = makeRecurrenceEditSchema(existing.kind).safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const d = parsed.data
  const { error } = await supabase.rpc('update_recurrence', {
    p_id: parsedId.data,
    p_name: d.name,
    p_amount_cents: d.amountCents,
    p_category_id: d.categoryId,
    p_source: d.source,
    p_due_day: d.dueDay,
  })
  if (error) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Alterações salvas.')
  refreshMoneyViews()
  redirect('/contas')
}

export async function endRecurrence(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/contas')
  const id = parsedId.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('end_recurrence', { p_id: id })
  if (error) redirect(`/contas/recorrencia/${id}?erro=1`)
  await setFlash('Encerrada. O histórico continua no Extrato.')
  refreshMoneyViews()
  redirect('/contas')
}
