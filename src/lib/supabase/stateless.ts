import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

// Cliente sem cookies e sem sessão: chave publicável, não lê nem grava a sessão de ninguém.
// Serve para conferir o código de um link (verifyOtp) sem iniciar nem trocar a sessão deste navegador.
export function createStatelessClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
