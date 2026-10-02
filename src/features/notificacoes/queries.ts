import 'server-only'
import { resolvePrefs, type PrefKind } from '@/domain/notifications'
import { createClient, requireUser } from '@/lib/supabase/server'

export async function loadNotificationPrefs(): Promise<Record<PrefKind, boolean>> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await supabase.from('notification_prefs').select('kind, enabled').eq('user_id', user.id)
  return resolvePrefs(data ?? [])
}
