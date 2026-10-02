import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

// Cliente da rota da tarefa: chave publicável, sem cookie e sem sessão (papel
// "anon" no banco). Não é um cliente administrativo: sozinho não lê nem grava
// nada. As funções que a tarefa chama exigem o segredo por parâmetro, e uma
// sessão de pessoa é recusada por elas.
//
// O segredo da tarefa vai como parâmetro de cada chamada ao banco. Por isso o
// endereço do banco tem de ser https, ou a própria máquina (banco local): um
// endereço em http digitado por engano não manda o segredo em texto aberto.
// A mesma regra está em scripts/rodar-tarefa.mjs.
export function isSafeJobUrl(url: string): boolean {
  if (typeof url !== 'string' || !/^https?:\/\/[^\s@\\]+$/.test(url)) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.username !== '' || parsed.password !== '') return false
  if (parsed.protocol === 'https:') return true
  return parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
}

// Sem endereço seguro não há cliente: a rota responde "não configurada" e nada é enviado ao banco.
export function createJobClient(): SupabaseClient | null {
  if (!isSafeJobUrl(env.supabaseUrl)) return null
  return createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
