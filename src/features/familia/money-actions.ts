'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { refreshMoneyViews } from '@/lib/refresh'
import { monthOf, todayInSaoPaulo, type ISODate } from '@/domain/dates'
import { UNEXPECTED } from '@/features/auth/errors'
import { familyBillSchema, familyReturnPath, makeFamilyExpenseSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const FAMILY_HOME = '/inicio/familia'
const FAMILY_BILLS = '/familia/contas'

const recordId = z.uuid()
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

type DbError = { message?: string; code?: string }

// Impasse entre duas gravações ao mesmo tempo: tentar de novo funciona.
const isDeadlock = (e: DbError) => e.code === '40P01'
const says = (e: DbError, part: string) => (e.message ?? '').includes(part)
const failure = (e: DbError) => (isDeadlock(e) ? UNEXPECTED : SAVE_FAILED)

// A família, o papel e a autoria são conferidos pelo banco (auth.uid()): daqui só vai o que a pessoa digitou.
export async function payFamilyBill(fd: FormData): Promise<void> {
  await requireUser()
  const volta = familyReturnPath(String(fd.get('volta') ?? ''))
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect(volta)
  const supabase = await createClient()
  const { error } = await supabase.rpc('pay_family_bill', { p_id: parsedId.data })
  if (error) {
    // Já paga (toque duplo) ou de fora da família: nada a avisar.
    if (says(error, 'Conta não encontrada')) redirect(volta)
    redirect(`${FAMILY_BILLS}?erro=1`)
  }
  await setFlash('Conta marcada como paga.')
  refreshMoneyViews()
  redirect(volta)
}

export async function updateFamilyExpense(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const values = readFields(fd, ['amount', 'when', 'date', 'note'] as const)
  const parsed = makeFamilyExpenseSchema(todayInSaoPaulo()).safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_update_family_expense', {
    p_id: parsedId.data,
    p_amount_cents: d.amountCents,
    p_on: d.occurredOn,
    p_note: d.note,
  })
  if (error) return errorState({ message: failure(error), values })
  await setFlash('Alterações salvas.')
  refreshMoneyViews()
  redirect(`${FAMILY_HOME}?mes=${monthOf(d.occurredOn)}`)
}

export async function deleteFamilyExpense(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect(FAMILY_HOME)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_delete_family_expense', { p_id: parsedId.data })
  if (error) {
    if (says(error, 'Gasto não encontrado')) redirect(FAMILY_HOME)
    redirect(`${FAMILY_HOME}?erro=1`)
  }
  await setFlash('Gasto excluído.')
  refreshMoneyViews()
  redirect(typeof data === 'string' && ISO_DAY.test(data) ? `${FAMILY_HOME}?mes=${monthOf(data as ISODate)}` : FAMILY_HOME)
}

export async function updateFamilyBill(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const values = readFields(fd, ['name', 'amount', 'dueDay'] as const)
  const parsed = familyBillSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_family_recurrence', {
    p_id: parsedId.data,
    p_name: d.name,
    p_amount_cents: d.amountCents,
    p_due_day: d.dueDay,
  })
  if (error) return errorState({ message: failure(error), values })
  await setFlash('Alterações salvas.')
  refreshMoneyViews()
  redirect(FAMILY_BILLS)
}

export async function endFamilyBill(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect(FAMILY_BILLS)
  const supabase = await createClient()
  const { error } = await supabase.rpc('end_family_recurrence', { p_id: parsedId.data })
  if (error) {
    if (says(error, 'Conta não encontrada')) redirect(FAMILY_BILLS)
    redirect(`${FAMILY_BILLS}?erro=1`)
  }
  await setFlash('Encerrada. O histórico continua no Extrato.')
  refreshMoneyViews()
  redirect(FAMILY_BILLS)
}
