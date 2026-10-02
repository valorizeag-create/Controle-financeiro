'use server'

import { redirect } from 'next/navigation'
import { isDeleteConfirmed } from '@/domain/account'
import { UNEXPECTED } from '@/features/auth/errors'
import { errorState, type FormState } from '@/lib/forms'
import { createClient, requireUser } from '@/lib/supabase/server'
import { endLocalSession } from './session'
import { CONFIRM_HINT, REAUTH_DELETE } from './state'

export async function deleteAccount(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  if (!isDeleteConfirmed(String(fd.get('confirm') ?? ''))) return errorState({ fieldErrors: { confirm: CONFIRM_HINT } })
  const supabase = await createClient()
  // Sem parâmetros: a função age sobre quem está na sessão (auth.uid()).
  let result = await supabase.rpc('delete_my_account')
  // Impasse com outra gravação no mesmo instante: nada foi apagado; uma nova tentativa resolve.
  if (result.error?.code === '40P01') result = await supabase.rpc('delete_my_account')
  if (result.error) {
    if ((result.error.message ?? '').includes('Entrada recente necessária')) return errorState({ message: REAUTH_DELETE, code: 'reauth' })
    return errorState({ message: UNEXPECTED })
  }
  // true: excluído agora. false: já estava excluído. Nos dois casos a sessão termina aqui.
  await endLocalSession(supabase)
  redirect('/cadastro-excluido')
}
