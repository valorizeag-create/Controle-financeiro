import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/
const VERIFIER_COOKIE = /^sb-.+-auth-token-code-verifier$/

// Encerra a sessão só neste aparelho. Com o cadastro já excluído o serviço de login recusa
// (403/404) ou pode estar fora do ar: nada disso pode prender a pessoa, então nunca lança.
export async function endLocalSession(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // segue: os cookies são apagados abaixo de qualquer jeito
  }
  try {
    const jar = await cookies()
    for (const { name } of jar.getAll()) {
      if (SESSION_COOKIE.test(name) || VERIFIER_COOKIE.test(name)) jar.delete(name)
    }
  } catch {
    // sem cookies para apagar neste contexto
  }
}
