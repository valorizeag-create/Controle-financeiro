'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { displayNameSchema, initialBalanceSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

export async function completeOnboardingBalance(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['initialBalance'] as const)
  const parsed = initialBalanceSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ initial_balance_cents: parsed.data.initialBalanceCents, onboarded_at: new Date().toISOString() })
    .eq('id', user.id)
  if (error) return errorState({ message: SAVE_FAILED, values })
  redirect('/boas-vindas/instalar')
}

export async function skipOnboardingBalance(): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', user.id)
  if (error) redirect('/boas-vindas/saldo?erro=1')
  redirect('/boas-vindas/instalar')
}

export async function updateInitialBalance(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['initialBalance'] as const)
  const parsed = initialBalanceSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ initial_balance_cents: parsed.data.initialBalanceCents }).eq('id', user.id)
  if (error) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Alterações salvas.')
  revalidatePath('/inicio')
  redirect('/configuracoes')
}

export async function updateDisplayName(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['displayName'] as const)
  const parsed = displayNameSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ display_name: parsed.data.displayName }).eq('id', user.id)
  if (error) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Alterações salvas.')
  // O nome aparece no menu lateral (layout) e no Seu mês.
  revalidatePath('/', 'layout')
  redirect('/configuracoes')
}
