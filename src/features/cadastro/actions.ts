'use server'

import { redirect } from 'next/navigation'
import { isDeleteConfirmed } from '@/domain/account'
import { UNEXPECTED } from '@/features/auth/errors'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { createClient, requireUser } from '@/lib/supabase/server'
import { createStatelessClient } from '@/lib/supabase/stateless'
import { loadSignIn } from './queries'
import { isSessionRecent } from './reauth'
import { emailChangeSchema, SAME_EMAIL, TOKEN_HASH } from './schemas'
import { endLocalSession } from './session'
import { CONFIRM_HINT, REAUTH_DELETE, REAUTH_EMAIL, type ConfirmEmailState } from './state'

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

// O e-mail novo é dado pessoal: vai só ao serviço de login; nunca a log, aviso temporário ou endereço.
export async function requestEmailChange(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['email'] as const)
  const parsed = emailChangeSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  if (parsed.data.email === user.email.trim().toLowerCase()) return errorState({ fieldErrors: { email: SAME_EMAIL }, values })
  // Cadastro que entra só com o Google não tem esta troca.
  if (!(await loadSignIn()).hasPassword) return errorState({ message: UNEXPECTED, values })
  const supabase = await createClient()
  if (!(await isSessionRecent(supabase))) return errorState({ message: REAUTH_EMAIL, code: 'reauth', values })
  const { error } = await supabase.auth.updateUser({ email: parsed.data.email })
  // A mesma resposta para endereço livre, endereço de outro cadastro e limite de envio.
  const status = error ? (error as { status?: number }).status : undefined
  if (error && (status === undefined || status >= 500 || status === 401 || status === 403)) return errorState({ message: UNEXPECTED, values })
  return { status: 'sent' }
}

export async function confirmEmailChange(_: ConfirmEmailState, fd: FormData): Promise<ConfirmEmailState> {
  const token = String(fd.get('token_hash') ?? '')
  if (!TOKEN_HASH.test(token)) return { status: 'invalid' }
  // Cliente sem cookies: confirmar não lê nem troca a sessão de quem está neste navegador.
  try {
    const { data, error } = await createStatelessClient().auth.verifyOtp({ type: 'email_change', token_hash: token })
    if (error) return { status: 'invalid' }
    return { status: data.session ? 'done' : 'half' }
  } catch {
    return { status: 'invalid' }
  }
}
