'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { formatBRL } from '@/domain/money'
import { todayInSaoPaulo } from '@/domain/dates'
import { makeExpenseSchema, makeIncomeSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

export async function createTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const today = todayInSaoPaulo()
  const kind = fd.get('kind') === 'income' ? 'income' : 'expense'
  const supabase = await createClient()

  if (kind === 'expense') {
    const values = readFields(fd, ['amount', 'categoryId', 'when', 'date', 'note', 'paymentMethod'] as const)
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
    const values = readFields(fd, ['amount', 'source', 'when', 'date'] as const)
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

  revalidatePath('/inicio')
  redirect('/inicio')
}

// Stub temporário: a Task 13 implementa a edição de verdade.
export async function updateTransaction(_: FormState, _fd: FormData): Promise<FormState> {
  return errorState({ message: SAVE_FAILED })
}
