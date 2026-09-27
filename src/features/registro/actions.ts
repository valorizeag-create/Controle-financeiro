'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { formatBRL } from '@/domain/money'
import { monthOf, todayInSaoPaulo, type ISODate } from '@/domain/dates'
import { refreshMoneyViews } from '@/lib/refresh'
import { makeExpenseSchema, makeIncomeSchema, parseRepeat } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const EXPENSE_FIELDS = ['amount', 'categoryId', 'when', 'date', 'note', 'paymentMethod'] as const
const INCOME_FIELDS = ['amount', 'source', 'when', 'date'] as const
const REPEAT_FIELDS = ['repeats', 'frequency'] as const
const ALL_FIELDS = ['amount', 'categoryId', 'source', 'when', 'date', 'note', 'paymentMethod'] as const
const recordId = z.uuid()

export async function createTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  const kind = fd.get('kind') === 'income' ? 'income' : 'expense'
  const supabase = await createClient()

  if (kind === 'expense') {
    const values = readFields(fd, [...EXPENSE_FIELDS, ...REPEAT_FIELDS])
    const parsed = makeExpenseSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const frequency = parseRepeat(values.repeats, values.frequency)
    if (frequency) {
      const { error } = await supabase.rpc('create_recurring_transaction', {
        p_kind: kind,
        p_amount_cents: d.amountCents,
        p_category_id: d.categoryId,
        p_source: null,
        p_note: d.note,
        p_payment_method: d.paymentMethod,
        p_occurred_on: d.occurredOn,
        p_frequency: frequency,
      })
      if (error) return errorState({ message: SAVE_FAILED, values })
    } else {
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
    }
    await setFlash('Anotado. Seu mês já está atualizado.')
  } else {
    const values = readFields(fd, [...INCOME_FIELDS, ...REPEAT_FIELDS])
    const parsed = makeIncomeSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const frequency = parseRepeat(values.repeats, values.frequency)
    if (frequency) {
      const { error } = await supabase.rpc('create_recurring_transaction', {
        p_kind: kind,
        p_amount_cents: d.amountCents,
        p_category_id: null,
        p_source: d.source,
        p_note: null,
        p_payment_method: null,
        p_occurred_on: d.occurredOn,
        p_frequency: frequency,
      })
      if (error) return errorState({ message: SAVE_FAILED, values })
    } else {
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        kind,
        amount_cents: d.amountCents,
        source: d.source,
        occurred_on: d.occurredOn,
      })
      if (error) return errorState({ message: SAVE_FAILED, values })
    }
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

  // O tipo vem do banco, nunca do formulário. Só registros confirmados da própria pessoa podem ser
  // editados aqui (contas a pagar/receber pendentes ganham tela própria no Plano 3).
  const existing = id
    ? (
        await supabase
          .from('transactions')
          .select('kind, status, paid_on')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle<{ kind: string; status: string; paid_on: ISODate | null }>()
      ).data
    : null
  if (!id || !existing || existing.status !== 'confirmed') return errorState({ message: SAVE_FAILED, values: readFields(fd, ALL_FIELDS) })

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
      .eq('status', 'confirmed')
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
      .eq('status', 'confirmed')
      .select('id')
    if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })
    occurredOn = d.occurredOn
  }

  await setFlash('Alterações salvas.')
  refreshMoneyViews()
  // O mês que a pessoa vê depois é o do dia efetivo: se o registro já tem uma data de pagamento
  // própria (paid_on), é ela quem decide o mês, não a data que acabou de ser editada.
  redirect(`/extrato?mes=${monthOf(existing.paid_on ?? occurredOn)}`)
}

export async function deleteTransaction(fd: FormData): Promise<void> {
  const user = await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/extrato')
  const id = parsedId.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .select('occurred_on, paid_on')
  if (error) redirect(`/extrato/${id}?erro=1`)
  const deleted = data?.[0] as { occurred_on: ISODate; paid_on: ISODate | null } | undefined
  if (!deleted) redirect('/extrato')
  await setFlash('Excluído. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect(`/extrato?mes=${monthOf(deleted.paid_on ?? deleted.occurred_on)}`)
}
