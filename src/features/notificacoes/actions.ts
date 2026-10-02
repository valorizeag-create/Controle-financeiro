'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isPrefKind } from '@/domain/notifications'
import { setFlash } from '@/lib/flash'
import { createClient, requireUser } from '@/lib/supabase/server'
import { pushSubscriptionSchema } from './schemas'

export async function setNotificationPref(fd: FormData): Promise<void> {
  const user = await requireUser()
  const kind = fd.get('kind')
  const enabled = fd.get('enabled')
  if (!isPrefKind(kind) || (enabled !== 'true' && enabled !== 'false')) redirect('/configuracoes')
  const supabase = await createClient()
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ user_id: user.id, kind, enabled: enabled === 'true' }, { onConflict: 'user_id,kind' })
  if (error) redirect('/configuracoes?erro=1')
  await setFlash('Alterações salvas.')
  revalidatePath('/configuracoes')
  redirect('/configuracoes')
}

// As três abaixo são chamadas pelo navegador (não por formulário): nunca lançam nem redirecionam.
// O endereço da inscrição é dado pessoal: só vai para o banco, por estas funções.
function readEndpoint(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048 ? value : null
}

export async function savePushSubscription(input: unknown): Promise<{ ok: boolean }> {
  await requireUser()
  const parsed = pushSubscriptionSchema.safeParse(input)
  if (!parsed.success) return { ok: false }
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
  })
  return { ok: !error }
}

export async function syncPushSubscription(endpoint: unknown): Promise<{ mine: boolean }> {
  await requireUser()
  const value = readEndpoint(endpoint)
  if (!value) return { mine: false }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('sync_push_subscription', { p_endpoint: value })
  return { mine: !error && data === true }
}

export async function removePushSubscription(endpoint: unknown): Promise<void> {
  await requireUser()
  const value = readEndpoint(endpoint)
  if (!value) return
  const supabase = await createClient()
  await supabase.rpc('delete_push_subscription', { p_endpoint: value })
}
