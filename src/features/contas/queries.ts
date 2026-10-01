import 'server-only'
import { createClient, requireUser } from '@/lib/supabase/server'
import { RECURRENCE_COLUMNS, toRecurrenceRow, type RecurrenceRawRow, type RecurrenceRow } from './types'

export async function loadRecurrences(): Promise<RecurrenceRow[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recurrences')
    .select(RECURRENCE_COLUMNS)
    .eq('user_id', user.id)
    .is('family_id', null)
    .is('ended_on', null)
    .order('name')
  if (error) throw error
  return (data as RecurrenceRawRow[]).map(toRecurrenceRow)
}

export async function loadRecurrence(id: string): Promise<RecurrenceRow | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recurrences')
    .select(RECURRENCE_COLUMNS)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('family_id', null)
    .is('ended_on', null)
    .maybeSingle<RecurrenceRawRow>()
  if (error) throw error
  return data ? toRecurrenceRow(data) : null
}
