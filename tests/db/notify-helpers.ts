import { randomBytes } from 'node:crypto'
import { admin, categoryId, type TestUser } from './helpers'

export const P256DH = `B${'A'.repeat(86)}`
export const AUTH = 'A'.repeat(22)
export const endpoint = (tag: string) => `https://fcm.googleapis.com/fcm/send/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const addDaysISO = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`

export async function subscribe(user: TestUser, ep: string = endpoint('t')): Promise<string> {
  const { error } = await user.client.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: P256DH, p_auth: AUTH })
  if (error) throw error
  return ep
}

export async function subscriptionsOf(userId: string): Promise<{ id: string; endpoint: string }[]> {
  const { data, error } = await admin.from('push_subscriptions').select('id, endpoint').eq('user_id', userId).order('created_at')
  if (error) throw error
  return data
}

export async function logRows(userId: string): Promise<{ id: string; kind: string; ref: string; sent_at: string | null; attempts: number }[]> {
  const { data, error } = await admin.from('notification_log').select('id, kind, ref, sent_at, attempts').eq('user_id', userId).order('created_at')
  if (error) throw error
  return data
}

// Molde + ocorrência a pagar (ou a receber), gravados pelo cliente administrativo (as guardas do banco valem).
export async function pendingBill(
  user: TestUser,
  opts: { name: string; dueOn: string; familyId?: string; kind?: 'expense' | 'income' },
): Promise<string> {
  const kind = opts.kind ?? 'expense'
  const category = kind === 'expense' ? await categoryId(user, 'casa') : null
  const period = monthStart(opts.dueOn)
  const rec = await admin.from('recurrences').insert({
    user_id: user.id, kind, name: opts.name, amount_cents: 10000, category_id: category, source: kind === 'income' ? opts.name : null,
    frequency: 'monthly', due_day: Number(opts.dueOn.slice(8)), starts_on: period, generated_through: period,
    ...(opts.familyId ? { family_id: opts.familyId } : {}),
  }).select('id').single()
  if (rec.error) throw rec.error
  const tx = await admin.from('transactions').insert({
    user_id: user.id, kind, amount_cents: 10000, category_id: category, source: kind === 'income' ? opts.name : null,
    occurred_on: opts.dueOn, status: 'pending', due_on: opts.dueOn, recurrence_id: rec.data.id, recurrence_period: period,
    ...(opts.familyId ? { family_id: opts.familyId } : {}),
  }).select('id').single()
  if (tx.error) throw tx.error
  return tx.data.id as string
}

// Os limites de convite por e-mail contam convites de qualquer família (por destinatário e no
// total), e o que execuções anteriores gravaram fica no banco. Aqui os convites por e-mail que já
// existem, e as linhas do registro dos limites (invite_email_ledger, Plano 9), passam a ter mais
// de 7 dias: nenhum deles conta para limite nenhum.
export async function forgetEarlierInvites(): Promise<void> {
  const now = Date.now()
  const old = new Date(now - 8 * 86_400_000).toISOString()
  const { error } = await admin.from('family_invites')
    .update({ created_at: old, expires_at: new Date(now - 2 * 86_400_000).toISOString() })
    .eq('sent_by_email', true)
  if (error) throw error
  const ledger = await admin.from('invite_email_ledger').update({ created_at: old }).gt('created_at', old)
  if (ledger.error) throw ledger.error
}

// Convites por e-mail de agora mesmo, de outras pessoas, no registro dos limites: só o resumo de
// um endereço sorteado e a hora (é tudo o que o registro guarda).
export async function fillInviteLedger(count: number): Promise<void> {
  const rows = Array.from({ length: count }, () => ({ recipient_hash: `\\x${randomBytes(32).toString('hex')}` }))
  const { error } = await admin.from('invite_email_ledger').insert(rows)
  if (error) throw error
}
