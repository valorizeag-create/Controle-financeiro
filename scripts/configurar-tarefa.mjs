// Prepara o banco para a tarefa dos avisos, sem nunca mostrar nem gravar o JOB_SECRET.
//
//   npm run job:configurar                              -> banco local: registra o resumo (SHA-256) do segredo
//                                                          e mostra os dois comandos do Vault para colar no SQL Editor
//   npm run job:configurar -- producao https://SEU-DOMINIO -> banco hospedado: não conecta a nada; mostra os três
//                                                          comandos para colar no SQL Editor do Supabase
//
// O segredo (JOB_SECRET) vem de .env.local e fica só na memória deste processo. O banco recebe apenas o SHA-256 dele;
// o agendador do banco (pg_net) recebe apenas o código de disparo, derivado do segredo e sem caminho de volta até ele.
// Rode de novo depois de cada `npx supabase db reset` (o Vault e a tabela de resumos são esvaziados) e quando trocar
// o segredo (nesse caso, troque também o Vault: veja a nota impressa no fim).
import { createHash, createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const ROUTE = '/api/jobs/notificacoes'
const LOCAL_LABEL = 'local'
const PROD_LABEL = 'prod'

function stop(message) {
  console.error(message)
  process.exit(1)
}

const secret = process.env.JOB_SECRET
if (!secret) stop('Defina JOB_SECRET em .env.local. Gere um com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"')
if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret)) stop('JOB_SECRET precisa ter de 43 a 128 caracteres (letras, números, "-" e "_"). Gere um novo.')

const hashHex = createHash('sha256').update(secret).digest('hex')
const token = createHmac('sha256', secret).update('iris-job-trigger-v1').digest('base64url')
const mode = process.argv[2] ?? 'local'

function vaultLines(url) {
  return [
    `select vault.create_secret('${url}', 'iris_job_url');`,
    `select vault.create_secret('${token}', 'iris_job_trigger');`,
  ]
}

if (mode === 'local') {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  if (!url || !key) stop('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (a do banco local) em .env.local.')
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) stop('Este modo é só para o banco local (NEXT_PUBLIC_SUPABASE_URL em localhost). Para o hospedado, use: producao https://SEU-DOMINIO')
  const match = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.exec(site)
  if (!match) stop('Para o banco local, NEXT_PUBLIC_SITE_URL deve ser http://localhost:PORTA.')
  // De dentro do Docker, o computador é host.docker.internal.
  const routeUrl = `http://host.docker.internal${match[2] ?? ''}${ROUTE}`
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await db.rpc('job_secret_set', { p_label: LOCAL_LABEL, p_hash_hex: hashHex })
  if (error) stop(`Não foi possível registrar o resumo do segredo (código ${error.code ?? 'desconhecido'}). O banco local está rodando e as migrações foram aplicadas?`)
  console.log(`Resumo do segredo registrado no banco local (nome "${LOCAL_LABEL}").`)
  console.log('')
  console.log('Falta contar ao agendador do banco onde fica a rota. Cole no SQL Editor (http://127.0.0.1:54323):')
  console.log('')
  for (const line of vaultLines(routeUrl)) console.log(line)
  console.log('')
  console.log('Depois, `npm run job:notificacoes -- manha` enfileira os lembretes da manhã e entrega.')
  console.log('Se o Vault já tiver esses nomes (por exemplo, depois de trocar o segredo), troque `vault.create_secret` por')
  console.log('`vault.update_secret((select id from vault.secrets where name = \'<nome>\'), \'<novo valor>\')`.')
} else if (mode === 'producao') {
  const origin = (process.argv[3] ?? '').replace(/\/+$/, '')
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(origin)) stop('Informe o endereço público do app, só com https e sem caminho. Exemplo: producao https://iris.exemplo.com.br')
  console.log('Cole no SQL Editor do Supabase hospedado (Dashboard -> SQL Editor), uma vez. Nenhuma linha contém o JOB_SECRET.')
  console.log('')
  console.log(`select public.job_secret_set('${PROD_LABEL}', '${hashHex}');`)
  for (const line of vaultLines(`${origin}${ROUTE}`)) console.log(line)
  console.log('')
  console.log('Troca do segredo: gere um novo, registre o resumo dele com outro nome (por exemplo "prod2"), troque JOB_SECRET na Netlify,')
  console.log(`atualize o Vault (vault.update_secret) com o novo código de disparo e, por fim, remova o nome antigo: select public.job_secret_set('${PROD_LABEL}', null);`)
} else {
  stop('Uso: npm run job:configurar            (banco local)\n     npm run job:configurar -- producao https://SEU-DOMINIO')
}
