import { env } from '@/lib/env'
import { readJobConfig } from '@/lib/server-env'
import { createJobClient } from '@/lib/supabase/job'
import { deliverBatch } from '@/features/notificacoes/deliver'
import { secretMatches, triggerToken, TRIGGER_HEADER } from '@/features/notificacoes/job-auth'
import { getMailer } from '@/features/notificacoes/mailer'
import { getPushSender } from '@/features/notificacoes/push-sender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

// Chamada só pelo agendador do banco (pg_cron + pg_net) ou por
// scripts/rodar-tarefa.mjs. Só POST: para qualquer outro método o Next responde
// 405 sem rodar nada daqui.
// O que autoriza é o código de disparo no cabeçalho. A rota não lê cookie nem
// sessão (fica fora do proxy): uma pessoa com o app aberto não consegue chamá-la.
// A resposta leva só números — o banco guarda a resposta de cada chamada por
// algumas horas. Nunca devolve nem registra o cabeçalho ou o segredo.
export async function POST(request: Request): Promise<Response> {
  const config = readJobConfig()
  if (!config) {
    // Sem JOB_SECRET no ambiente a tarefa está desligada; o resto do app funciona.
    return Response.json({ error: 'not_configured' }, { status: 503, headers: NO_STORE })
  }
  if (!secretMatches(request.headers.get(TRIGGER_HEADER), triggerToken(config.secret))) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE })
  }
  try {
    const result = await deliverBatch({
      db: createJobClient(), secret: config.secret, push: getPushSender(), mailer: getMailer(), siteUrl: env.siteUrl,
    })
    return Response.json(result, { headers: NO_STORE })
  } catch {
    return new Response(null, { status: 500, headers: NO_STORE })
  }
}
