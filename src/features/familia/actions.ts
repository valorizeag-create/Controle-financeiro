'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, requireUser } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { refreshMoneyViews } from '@/lib/refresh'
import { todayInSaoPaulo } from '@/domain/dates'
import { UNEXPECTED } from '@/features/auth/errors'
import { myFamilyId } from './queries'
import { familyNameSchema, INVITE_CODE, inviteLink, memberIdSchema } from './schemas'
import type { InviteState } from './invite-state'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
// Mesmo formato (uuid), usado aqui para o convite.
const inviteIdSchema = memberIdSchema
const FULL = 'A família já está completa.'

type DbError = { message?: string; code?: string }

// Impasse entre duas gravações ao mesmo tempo: tentar de novo funciona.
const isDeadlock = (e: DbError) => e.code === '40P01'
const says = (e: DbError, part: string) => (e.message ?? '').includes(part)

export async function createFamily(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser()
  const values = readFields(fd, ['name'] as const)
  const parsed = familyNameSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_family', { p_name: parsed.data.name })
  if (error) {
    if (says(error, 'já participa')) redirect('/familia')
    return errorState({ message: isDeadlock(error) ? UNEXPECTED : SAVE_FAILED, values })
  }
  await setFlash('Família criada.')
  refreshMoneyViews()
  redirect('/familia')
}

// O código do convite só volta para quem pediu o link: nunca vai para aviso, log ou endereço.
export async function createInvite(_: InviteState, _fd: FormData): Promise<InviteState> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_family_invite')
  if (error) {
    if (says(error, 'completa')) return { status: 'error', message: FULL }
    return { status: 'error', message: isDeadlock(error) ? UNEXPECTED : SAVE_FAILED }
  }
  const row = (Array.isArray(data) ? data[0] : null) as { invite_code?: unknown; invite_expires_at?: unknown } | null
  const code = row?.invite_code
  const expires = typeof row?.invite_expires_at === 'string' ? new Date(row.invite_expires_at) : null
  if (typeof code !== 'string' || !INVITE_CODE.test(code) || !expires || Number.isNaN(expires.getTime())) {
    return { status: 'error', message: SAVE_FAILED }
  }
  revalidatePath('/familia')
  return { status: 'ready', link: inviteLink(env.siteUrl, code), expiresOn: todayInSaoPaulo(expires) }
}

export async function revokeInvite(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = inviteIdSchema.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/familia?erro=1')
  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_family_invite', { p_id: parsedId.data })
  if (error) redirect('/familia?erro=1')
  await setFlash('Convite cancelado.')
  revalidatePath('/familia')
  redirect('/familia')
}

export async function acceptInvite(fd: FormData): Promise<void> {
  await requireUser()
  const code = String(fd.get('code') ?? '')
  if (!INVITE_CODE.test(code)) redirect('/familia')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('accept_family_invite', { p_code: code })
  if (error) {
    // convite = o banco diz que não vale (inválido, vencido, usado, família cheia); 1 = passageiro ou inesperado, tentar de novo.
    const reason = says(error, 'já participa') ? 'familia' : says(error, 'Convite inválido') || says(error, 'completa') ? 'convite' : '1'
    redirect(`/convite/${code}?erro=${reason}`)
  }
  let name: string | null = null
  if (typeof data === 'string') {
    const { data: family } = await supabase.from('families').select('name').eq('id', data).maybeSingle<{ name: string }>()
    name = family?.name ?? null
  }
  await setFlash(name ? `Você entrou na família ${name}.` : 'Você entrou na família.')
  refreshMoneyViews()
  redirect('/familia')
}

export async function leaveFamily(_fd: FormData): Promise<void> {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.rpc('leave_family')
  if (error) redirect(says(error, 'administrar') ? '/familia?erro=admin' : '/familia?erro=1')
  await setFlash('Você saiu da família.')
  refreshMoneyViews()
  redirect('/familia')
}

// Remover e passar a administração: a pessoa vem do formulário só como identificador;
// o banco confere que quem chama administra e que ela é da mesma família. O nome vem do banco.
async function actOnMember(
  fd: FormData,
  rpcName: 'remove_family_member' | 'transfer_family_admin',
  message: (name: string) => string,
): Promise<void> {
  const user = await requireUser()
  const parsedId = memberIdSchema.safeParse(String(fd.get('userId') ?? ''))
  if (!parsedId.success) redirect('/familia?erro=1')
  const userId = parsedId.data
  const supabase = await createClient()
  const familyId = await myFamilyId(supabase, user.id)
  if (!familyId) redirect('/familia?erro=1')
  const { data: member, error: readError } = await supabase
    .from('family_members')
    .select('display_name')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle<{ display_name: string | null }>()
  if (readError || !member) redirect('/familia?erro=1')
  const { error } = await supabase.rpc(rpcName, { p_user: userId })
  if (error) redirect('/familia?erro=1')
  await setFlash(message(member.display_name ?? 'A pessoa'))
  refreshMoneyViews()
  redirect('/familia')
}

export async function removeMember(fd: FormData): Promise<void> {
  return actOnMember(fd, 'remove_family_member', (name) => `${name} saiu da família.`)
}

// O convite pendente de quem administrava é cancelado pelo banco: quem administra agora decide quem entra.
export async function transferAdmin(fd: FormData): Promise<void> {
  return actOnMember(fd, 'transfer_family_admin', (name) => `${name} agora administra a família.`)
}
