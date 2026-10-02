import { createClient } from '@supabase/supabase-js'

// A agenda da Íris (pg_cron) fica pausada enquanto os testes de banco rodam e volta no fim.
// Sem isso, uma tarefa que disparasse no meio de um teste (00h05, 9h, 21h de Brasília ou a
// cada 10 minutos) geraria contas e avisos que o teste não espera.
export default async function setup(): Promise<() => Promise<void>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.')
  const admin = createClient(url, key, { auth: { persistSession: false } })
  const paused = await admin.rpc('job_set_paused', { p_paused: true })
  if (paused.error) {
    throw new Error(`Não foi possível pausar a agenda antes dos testes de banco (o Supabase local está no ar?): ${paused.error.message}`)
  }
  return async () => {
    const resumed = await admin.rpc('job_set_paused', { p_paused: false })
    if (resumed.error) console.warn(`A agenda continuou pausada: ${resumed.error.message}`)
  }
}
