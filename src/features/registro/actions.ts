'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { formatBRL } from '@/domain/money'
import { monthOf, todayInSaoPaulo, type ISODate } from '@/domain/dates'
import { makeExpenseSchema, makeIncomeSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const EXPENSE_FIELDS = ['amount', 'categoryId', 'when', 'date', 'note', 'paymentMethod'] as const
const INCOME_FIELDS = ['amount', 'source', 'when', 'date'] as const
const ALL_FIELDS = ['amount', 'categoryId', 'source', 'when', 'date', 'note', 'paymentMethod'] as const
const recordId = z.uuid()

function refreshMoneyViews() {
  revalidatePath('/inicio')
  revalidatePath('/extrato')
}

export async function createTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  const kind = fd.get('kind') === 'income' ? 'income' : 'expense'
  const supabase = await createClient()

  if (kind === 'expense') {
    const values = readFields(fd, EXPENSE_FIELDS)
    const parsed = makeExpenseSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      kind,
      amount_cents: d.amountCents,
      category_id: d.categoryId,
      note: d.note,
      payment_method: d.paymentMethod,
      occurred_on: d.occurredOn,
    })
    if (error) return errorState({ message: SAVE_FAILED, values })
    await setFlash('Anotado. Seu mês já está atualizado.')
  } else {
    const values = readFields(fd, INCOME_FIELDS)
    const parsed = makeIncomeSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      kind,
      amount_cents: d.amountCents,
      source: d.source,
      occurred_on: d.occurredOn,
    })
    if (error) return errorState({ message: SAVE_FAILED, values })
    await setFlash(`Anotado. Mais ${formatBRL(d.amountCents)} no seu mês.`)
  }

  refreshMoneyViews()
  redirect('/inicio')
}

export async function updateTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  const id = parsedId.success ? parsedId.data : null
  const supabase = await createClient()

  // O tipo vem do banco (a RLS só devolve registros da própria pessoa), nunca do formulário.
  const existing = id ? (await supabase.from('transactions').select('kind').eq('id', id).maybeSingle()).data : null
  if (!id || !existing) return errorState({ message: SAVE_FAILED, values: readFields(fd, ALL_FIELDS) })

  let occurredOn: ISODate
  if (existing.kind === 'income') {
    const values = readFields(fd, INCOME_FIELDS)
    const parsed = makeIncomeSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const { data, error } = await supabase
      .from('transactions')
      .update({ amount_cents: d.amountCents, source: d.source, occurred_on: d.occurredOn })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
    if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })
    occurredOn = d.occurredOn
  } else {
    const values = readFields(fd, EXPENSE_FIELDS)
    const parsed = makeExpenseSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const { data, error } = await supabase
      .from('transactions')
      .update({ amount_cents: d.amountCents, category_id: d.categoryId, note: d.note, payment_method: d.paymentMethod, occurred_on: d.occurredOn })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
    if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })
    occurredOn = d.occurredOn
  }

  await setFlash('Alterações salvas.')
  refreshMoneyViews()
  // Se a data mudou de mês, a pessoa vê o registro onde ele foi parar.
  redirect(`/extrato?mes=${monthOf(occurredOn)}`)
}

export async function deleteTransaction(fd: FormData): Promise<void> {
  const user = await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/extrato')
  const id = parsedId.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', user.id).select('occurred_on')
  if (error) redirect(`/extrato/${id}?erro=1`)
  const deleted = data?.[0]
  if (!deleted) redirect('/extrato')
  await setFlash('Excluído. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect(`/extrato?mes=${monthOf(deleted.occurred_on)}`)
}
