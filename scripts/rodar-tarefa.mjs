// Roda a tarefa dos avisos na máquina local, sem esperar o agendador.
//
//   npm run job:notificacoes                 -> só pede à rota que entregue o que está na fila
//   npm run job:notificacoes -- manha        -> antes, enfileira os avisos da manhã
//   npm run job:notificacoes -- noite        -> antes, enfileira o lembrete da noite
//   npm run job:notificacoes -- ocorrencias  -> antes, gera as contas do dia
//
// Usa a chave publicável e o segredo da tarefa (JOB_SECRET) de .env.local.
// Não usa a chave de serviço. O app precisa estar rodando (npm run dev).
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const JOBS = ['manha', 'noite', 'ocorrencias']
const secret = process.env.JOB_SECRET
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')
const job = process.argv[2]

function stop(message) {
  console.error(message)
  process.exit(1)
}

if (!secret) stop('Defina JOB_SECRET em .env.local.')
if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret)) stop('JOB_SECRET precisa ter de 43 a 128 caracteres (letras, números, "-" e "_"). Gere um novo.')
// O código de disparo só vai para a própria máquina ou por https.
if (!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$)/.test(site)) stop('Confira NEXT_PUBLIC_SITE_URL em .env.local.')
if (job !== undefined && !JOBS.includes(job)) stop(`Tarefa desconhecida. Use: ${JOBS.join(', ')}.`)

if (job) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) stop('Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local.')
  // O segredo vai como parâmetro da chamada ao banco: só por https ou para a própria máquina
  // (a mesma regra de isSafeJobUrl, em src/lib/supabase/job.ts).
  if (!/^(https:\/\/[^\s@\\]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?)$/.test(url)) {
    stop('Confira NEXT_PUBLIC_SUPABASE_URL em .env.local: precisa ser https, ou http://localhost (banco local).')
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.rpc('job_trigger', { p_secret: secret, p_job: job })
  if (error) stop(`A tarefa "${job}" não rodou (código ${error.code ?? 'desconhecido'}). O segredo está registrado no banco?`)
  console.log(`${job}: ${data ?? 0}`)
}

const token = createHmac('sha256', secret).update('iris-job-trigger-v1').digest('base64url')
let response
try {
  response = await fetch(`${site}/api/jobs/notificacoes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-iris-job-trigger': token },
    body: '{}',
  })
} catch {
  stop(`Não foi possível chamar ${site}. O app está rodando?`)
}
console.log(`entrega: ${response.status} ${await response.text()}`)
process.exit(response.ok ? 0 : 1)
