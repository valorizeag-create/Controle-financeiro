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
