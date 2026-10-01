'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { formatBRL } from '@/domain/money'
import { monthOf, todayInSaoPaulo, type ISODate } from '@/domain/dates'
import { refreshMoneyViews } from '@/lib/refresh'
import { UNEXPECTED } from '@/features/auth/errors'
import { myFamilyId } from '@/features/familia/queries'
import { familyPatch } from '@/features/familia/schemas'
import { INSTALLMENT_MESSAGES, makeExpenseSchema, makeIncomeSchema, parseRepeat, readInstallments } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const EXPENSE_FIELDS = ['amount', 'categoryId', 'when', 'date', 'note', 'paymentMethod', 'cardId', 'family', 'familyChoice'] as const
const INCOME_FIELDS = ['amount', 'source', 'when', 'date'] as const
const REPEAT_FIELDS = ['repeats', 'frequency'] as const
const INSTALLMENT_FIELDS = ['parcelado', 'installments'] as const
const ALL_FIELDS = ['amount', 'categoryId', 'source', 'when', 'date', 'note', 'paymentMethod', 'cardId', 'family', 'familyChoice'] as const
const recordId = z.uuid()

// Impasse entre duas gravações ao mesmo tempo (40P01): tentar de novo funciona.
const saveFailure = (error: { code?: string }) => (error.code === '40P01' ? UNEXPECTED : SAVE_FAILED)

type Supabase = Awaited<ReturnType<typeof createClient>>

// A família de quem anota vem sempre do banco, pela pessoa logada: o formulário só diz "sim" ou "não".
async function familyOf(supabase: Supabase, userId: string): Promise<{ ok: true; id: string | null } | { ok: false }> {
  try {
    return { ok: true, id: await myFamilyId(supabase, userId) }
  } catch {
    return { ok: false }
  }
}

export async function createTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  const kind = fd.get('kind') === 'income' ? 'income' : 'expense'
  const supabase = await createClient()

  if (kind === 'expense') {
    const values = readFields(fd, [...EXPENSE_FIELDS, ...REPEAT_FIELDS, ...INSTALLMENT_FIELDS])
    const parsed = makeExpenseSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    const { count: installmentCount, error: installmentError } = readInstallments(values)
    if (installmentError) return errorState({ fieldErrors: { installments: installmentError }, values })
    const frequency = parseRepeat(values.repeats, values.frequency)
    const wantsFamily = values.family === 'on'
    if (installmentCount !== null) {
      if (frequency) return errorState({ fieldErrors: { installments: INSTALLMENT_MESSAGES.oneOption }, values })
      if (d.amountCents < installmentCount) return errorState({ fieldErrors: { installments: INSTALLMENT_MESSAGES.tooSmall }, values })
      if (d.occurredOn > today) return errorState({ fieldErrors: { date: 'Escolha o dia.' }, values })
      const { error } = await supabase.rpc('create_installment_purchase', {
        p_amount_cents: d.amountCents,
        p_count: installmentCount,
        p_category_id: d.categoryId,
        p_note: d.note,
        p_card_id: d.cardId,
        p_payment_method: d.paymentMethod,
        p_purchased_on: d.occurredOn,
        ...(wantsFamily ? { p_family: true } : {}),
      })
      if (error) return errorState({ message: saveFailure(error), values })
    } else if (frequency) {
      const { error } = await supabase.rpc('create_recurring_transaction', {
        p_kind: kind,
        p_amount_cents: d.amountCents,
        p_category_id: d.categoryId,
        p_source: null,
        p_note: d.note,
        p_payment_method: d.paymentMethod,
        p_occurred_on: d.occurredOn,
        p_frequency: frequency,
        p_card_id: d.cardId,
        ...(wantsFamily ? { p_family: true } : {}),
      })
      if (error) return errorState({ message: saveFailure(error), values })
    } else {
      let familyId: string | null = null
      if (wantsFamily) {
        const mine = await familyOf(supabase, user.id)
        if (!mine.ok || !mine.id) return errorState({ message: SAVE_FAILED, values })
        familyId = mine.id
      }
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        kind,
        amount_cents: d.amountCents,
        category_id: d.categoryId,
        note: d.note,
        payment_method: d.paymentMethod,
        card_id: d.cardId,
        occurred_on: d.occurredOn,
        ...(familyId ? { family_id: familyId } : {}),
      })
      if (error) return errorState({ message: saveFailure(error), values })
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
        p_card_id: null,
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
          .select('kind, status, paid_on, family_id')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle<{ kind: string; status: string; paid_on: ISODate | null; family_id: string | null }>()
      ).data
    : null
  if (!id || !existing || existing.status !== 'confirmed') return errorState({ message: SAVE_FAILED, values: readFields(fd, ALL_FIELDS) })

  // Se o registro já tem uma data de pagamento própria (conta paga ou entrada recebida), a data
  // editada no formulário é o dia do pagamento, não o vencimento original.
  const dateColumn = existing.paid_on ? 'paid_on' : 'occurred_on'
  let occurredOn: ISODate
  if (existing.kind === 'income') {
    const values = readFields(fd, INCOME_FIELDS)
    const parsed = makeIncomeSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    // Um pagamento não pode ter acontecido no futuro: se a data editada é a de pagamento
    // (paid_on), ela não pode passar de hoje, mesmo que a data de entrada permita.
    if (dateColumn === 'paid_on' && d.occurredOn > today) return errorState({ fieldErrors: { date: 'Escolha o dia.' }, values })
    const { data, error } = await supabase
      .from('transactions')
      .update({ amount_cents: d.amountCents, source: d.source, [dateColumn]: d.occurredOn })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .is('installment_plan_id', null)
      .is('goal_id', null)
      .select('id')
    if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })
    occurredOn = d.occurredOn
  } else {
    const values = readFields(fd, EXPENSE_FIELDS)
    const parsed = makeExpenseSchema(today).safeParse(values)
    if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
    const d = parsed.data
    // Um pagamento não pode ter acontecido no futuro: se a data editada é a de pagamento
    // (paid_on), ela não pode passar de hoje, mesmo que gasto permita datas futuras.
    if (dateColumn === 'paid_on' && d.occurredOn > today) return errorState({ fieldErrors: { date: 'Escolha o dia.' }, values })
    // "Gasto da família": só em gasto confirmado, nunca pago com meta (o filtro goal_id abaixo
    // também barra). A família vem do banco; sem família, o aviso é o de sempre.
    // Só mexe na família quando o formulário declara a escolha (campo oculto familyChoice=1, ao lado
    // da caixa). Sem o marcador (formulário antigo ou sem a caixa), family_id fica como está.
    const wantsFamily = values.family === 'on'
    let patch: { family_id?: string | null } = {}
    if (values.familyChoice === '1') {
      if (wantsFamily && !existing.family_id) {
        const mine = await familyOf(supabase, user.id)
        if (!mine.ok || !mine.id) return errorState({ message: SAVE_FAILED, values })
        patch = familyPatch({ existingFamilyId: null, wantsFamily, myFamilyId: mine.id })
      } else {
        patch = familyPatch({ existingFamilyId: existing.family_id ?? null, wantsFamily, myFamilyId: null })
      }
    }
    const { data, error } = await supabase
      .from('transactions')
      .update({
        amount_cents: d.amountCents,
        category_id: d.categoryId,
        ...patch,
        note: d.note,
        payment_method: d.paymentMethod,
        card_id: d.cardId,
        ...(d.cardId || d.paymentMethod ? { card_deleted: false } : {}),
        [dateColumn]: d.occurredOn,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .is('installment_plan_id', null)
      .is('goal_id', null)
      .select('id')
    if (error) return errorState({ message: saveFailure(error), values })
    if (!data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })
    occurredOn = d.occurredOn
  }

  await setFlash('Alterações salvas.')
  refreshMoneyViews()
  // A data salva agora é sempre a efetiva (paid_on quando existe, occurred_on quando não).
  redirect(`/extrato?mes=${monthOf(occurredOn)}`)
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
    .is('installment_plan_id', null)
    .is('goal_id', null)
    .select('occurred_on, paid_on')
  if (error) redirect(`/extrato/${id}?erro=1`)
  const deleted = data?.[0] as { occurred_on: ISODate; paid_on: ISODate | null } | undefined
  if (!deleted) redirect('/extrato')
  await setFlash('Excluído. Seu mês já está atualizado.')
  refreshMoneyViews()
  redirect(`/extrato?mes=${monthOf(deleted.paid_on ?? deleted.occurred_on)}`)
}
