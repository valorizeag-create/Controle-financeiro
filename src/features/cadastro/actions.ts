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

// A sessão acabou entre a conferência e a chamada: nada foi apagado, a pessoa só precisa entrar de novo.
function sessionEnded(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? ''
  return (
    error.code === 'PGRST301' ||
    message.includes('Sessão necessária') ||
    message.startsWith('permission denied for function')
  )
}

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
    if (sessionEnded(result.error)) {
      await endLocalSession(supabase)
      redirect('/entrar')
    }
    return errorState({ message: UNEXPECTED })
  }
  // A função responde true (excluído agora) ou false (já estava excluído). Outra coisa não prova nada.
  if (typeof result.data !== 'boolean') return errorState({ message: UNEXPECTED })
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
  // updateUser com o cliente da sessão (PKCE) deixa um verificador e um registro de fluxo que o link por código
  // (verifyOtp) não usa. É inofensivo; não trocar por exchangeCodeForSession.
  let error: { status?: number; name?: string } | null
  try {
    error = (await supabase.auth.updateUser({ email: parsed.data.email })).error
  } catch {
    return errorState({ message: UNEXPECTED, values })
  }
  // A mesma resposta para endereço livre e endereço de outro cadastro (respostas 4xx).
  // Falha de verdade não vira "enviado": rede (auth-js devolve status 0), servidor (5xx), sessão (401/403),
  // limite de envio (429: nada foi enviado), sessão ausente e qualquer erro sem status.
  if (error) {
    const status = error.status
    const failed = !status || status >= 500 || status === 401 || status === 403 || status === 429 || error.name === 'AuthSessionMissingError'
    if (failed) return errorState({ message: UNEXPECTED, values })
  }
  return { status: 'sent' }
}

// Só erro do cliente que de fato quer dizer "vencido, usado ou inventado" é link que não vale.
// Rede (status 0), servidor (5xx), limite (429) e exceção são falhas passageiras: o link continua valendo.
function isDeadLink(error: { status?: number }): boolean {
  const status = error.status
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 429
}

export async function confirmEmailChange(_: ConfirmEmailState, fd: FormData): Promise<ConfirmEmailState> {
  const token = String(fd.get('token_hash') ?? '')
  if (!TOKEN_HASH.test(token)) return { status: 'invalid' }
  // Cliente sem cookies: confirmar não lê nem troca a sessão de quem está neste navegador.
  const client = createStatelessClient()
  try {
    const { data, error } = await client.auth.verifyOtp({ type: 'email_change', token_hash: token })
    if (error) return isDeadLink(error) ? { status: 'invalid' } : { status: 'error' }
    if (!data.session) return { status: 'half' }
    // A sessão que o serviço devolve vive só neste cliente descartável: encerra para não deixar sessão órfã.
    try {
      await client.auth.signOut({ scope: 'local' })
    } catch {
      // nada a fazer
    }
    return { status: 'done' }
  } catch {
    return { status: 'error' }
  }
}
