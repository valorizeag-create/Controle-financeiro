import 'server-only'
import { createClient, requireUser } from '@/lib/supabase/server'
import { CARD_COLUMNS, toCardRow, type CardRawRow, type CardRow } from './types'

export async function loadCards(): Promise<CardRow[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cards')
    .select(CARD_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at')
    .order('id')
  if (error) throw error
  return (data as CardRawRow[]).map(toCardRow)
}

export async function loadCard(id: string): Promise<CardRow | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cards')
    .select(CARD_COLUMNS)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<CardRawRow>()
  if (error) throw error
  return data ? toCardRow(data) : null
}

export async function loadLastCardId(): Promise<string | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('card_id')
    .eq('user_id', user.id)
    .eq('kind', 'expense')
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .order('id')
    .limit(1)
  if (error) throw error
  return data?.[0]?.card_id ?? null
}
