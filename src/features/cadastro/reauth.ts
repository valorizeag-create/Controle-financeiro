import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Só o banco decide de verdade (a exclusão confere de novo); aqui só se escolhe a tela.
export async function isSessionRecent(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('session_is_recent')
    return !error && data === true
  } catch {
    return false
  }
}
