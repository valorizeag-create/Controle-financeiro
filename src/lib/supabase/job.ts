import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

// Cliente da rota da tarefa: chave publicável, sem cookie e sem sessão (papel
// "anon" no banco). Não é um cliente administrativo: sozinho não lê nem grava
// nada. As funções que a tarefa chama exigem o segredo por parâmetro, e uma
// sessão de pessoa é recusada por elas.
export function createJobClient() {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
