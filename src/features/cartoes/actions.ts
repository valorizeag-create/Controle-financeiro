'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { cardSchema } from './schemas'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const CARD_FIELDS = ['nickname', 'kind', 'color'] as const

const recordId = z.uuid()

export async function createCard(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, CARD_FIELDS)
  const parsed = cardSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('cards').insert({
    user_id: user.id,
    nickname: d.nickname,
    kind: d.kind,
    color: d.color,
  })
  if (error) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Cartão criado.')
  revalidatePath('/', 'layout')
  redirect('/cartoes')
}

export async function updateCard(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, CARD_FIELDS)
  const parsed = cardSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const d = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cards')
    .update({ nickname: d.nickname, kind: d.kind, color: d.color })
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .select('id')
  if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })
  await setFlash('Alterações salvas.')
  revalidatePath('/', 'layout')
  redirect('/cartoes')
}

export async function deleteCard(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = recordId.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/cartoes')
  const id = parsedId.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_card', { p_card_id: id })
  if (error) redirect(`/cartoes/${id}?erro=1`)
  await setFlash('Cartão excluído.')
  revalidatePath('/', 'layout')
  redirect('/cartoes')
}
