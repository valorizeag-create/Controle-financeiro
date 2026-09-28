'use server'

import { redirect } from 'next/navigation'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { refreshMoneyViews } from '@/lib/refresh'
import { parseMonthKey } from '@/domain/dates'
import { parsePlanFields } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const SAVED = 'Planejamento salvo. Agora é só acompanhar.'

export async function saveBudgets(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const month = parseMonthKey(String(fd.get('month') ?? ''))
  const parsed = parsePlanFields(fd)
  if (!month || !parsed) return errorState({ message: SAVE_FAILED, values: parsed?.values })
  const { entries, values, fieldErrors } = parsed
  if (Object.keys(fieldErrors).length > 0) return errorState({ fieldErrors, values })

  const supabase = await createClient()
  const { data: owned, error: categoriesError } = await supabase.from('categories').select('id').eq('user_id', user.id)
  if (categoriesError || !owned) return errorState({ message: SAVE_FAILED, values })
  // Categoria excluída em outra aba: ignora a linha e salva o resto.
  const known = new Set(owned.map((c) => c.id as string))
  const kept = entries.filter((e) => known.has(e.categoryId))

  if (kept.length > 0) {
    const { error } = await supabase.rpc('set_month_budgets', {
      p_month: `${month}-01`,
      p_category_ids: kept.map((e) => e.categoryId),
      p_amounts: kept.map((e) => e.amountCents),
    })
    if (error) return errorState({ message: SAVE_FAILED, values })
  }
  await setFlash(SAVED)
  refreshMoneyViews()
  redirect(`/planejamento?mes=${month}`)
}

export async function repeatPreviousBudgets(fd: FormData): Promise<void> {
  await requireUser()
  const month = parseMonthKey(String(fd.get('month') ?? ''))
  if (!month) redirect('/planejamento')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('repeat_previous_budgets', { p_month: `${month}-01` })
  if (error) redirect(`/planejamento?mes=${month}&erro=1`)
  if (typeof data === 'number' && data > 0) await setFlash(SAVED)
  refreshMoneyViews()
  redirect(`/planejamento?mes=${month}`)
}
