import 'server-only'
import { z } from 'zod'
import { NOTIFICATION_KINDS } from '@/domain/notifications'
import { monthSummaryEmail } from './emails'
import type { Mailer } from './mailer'
import { notificationMessage, type PushMessage } from './messages'
import type { PushSender, PushTarget } from './push-sender'

// Entrega dos avisos da fila: pega um lote no banco, envia e encerra LINHA POR
// LINHA. Regras que o banco não tem como garantir e que ficam aqui:
// - o tempo é conferido ANTES de pegar cada lote (cada linha pega gasta uma das
//   3 tentativas dela): sem folga, não se pega mais nada;
// - toda linha pega é encerrada, dizendo o que aconteceu em cada canal, mesmo
//   quando o tempo acaba no meio do lote;
// - uma tentativa por aparelho e por e-mail; quem decide tentar de novo é o
//   banco (15 minutos depois, até 3 vezes);
// - nada pessoal nem secreto vai para o log: só números, tipos e códigos.

type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }

export type DeliverDeps = {
  db: Rpc
  secret: string
  push: PushSender | null
  mailer: Mailer | null
  siteUrl: string
  limit?: number
  // Tempo para enviar. Depois dele nenhum envio começa e os que estão em andamento são abandonados.
  budgetMs?: number
  // Folga mínima para pegar mais um lote.
  reserveMs?: number
  // Tempo a mais, depois do limite, só para encerrar as linhas já pegas.
  graceMs?: number
  now?: () => number
}

// sent/failed contam linhas (uma linha com push enviado e e-mail com falha entra
// nas duas); removed, inscrições que não valem mais; unconfirmed, linhas cujo
// encerramento o banco não registrou.
export type DeliverResult = { claimed: number; sent: number; failed: number; removed: number; unconfirmed: number }

type Channel = 'sent' | 'none' | 'failed'

const LIMIT = 20
// A função do servidor tem cerca de 10 s: 6 s para enviar + 2,5 s para encerrar.
const BUDGET_MS = 6000
const RESERVE_MS = 2500
const GRACE_MS = 2500
const FINISH_TIMEOUT_MS = 2000
const CONCURRENCY = 5

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const idsSchema = z.object({ n_claim: uuid, n_id: uuid })
const rowSchema = z.object({
  n_kind: z.enum(NOTIFICATION_KINDS),
  n_params: z.unknown(),
  n_email: z.string().min(3).max(320).nullable(),
  n_subscriptions: z
    .array(z.object({ id: uuid, endpoint: z.string().max(2048), p256dh: z.string().max(200), auth: z.string().max(100) }))
    .max(10),
})

// Só o código do erro (SQLSTATE ou código da API), nunca a mensagem.
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && /^[A-Za-z0-9]{1,10}$/.test(code) ? code : 'erro'
}

// Erros do banco que passam sozinhos (tempo do comando esgotado, conflito entre gravações,
// impasse): repetir a chamada costuma funcionar. Qualquer outro código é uma recusa.
const TRANSIENT = new Set(['57014', '40001', '40P01'])

function within<T>(work: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), Math.max(0, ms))
    Promise.resolve(work).then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  }))
}

export async function deliverBatch(deps: DeliverDeps): Promise<DeliverResult> {
  const now = deps.now ?? Date.now
  const start = now()
  const deadline = start + (deps.budgetMs ?? BUDGET_MS)
  const hardStop = deadline + (deps.graceMs ?? GRACE_MS)
  const reserve = deps.reserveMs ?? RESERVE_MS
  const limit = deps.limit ?? LIMIT
  const siteUrl = deps.siteUrl.replace(/\/+$/, '')
  const result: DeliverResult = { claimed: 0, sent: 0, failed: 0, removed: 0, unconfirmed: 0 }
  const kinds: Record<string, number> = {}

  async function claim(): Promise<unknown[]> {
    const { data, error } = await within(
      deps.db.rpc('job_claim_notifications', { p_secret: deps.secret, p_limit: limit }), deadline - now(),
    )
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('claim')
    return data
  }

  async function sendOne(target: PushTarget, message: PushMessage): Promise<'sent' | 'gone' | 'failed'> {
    const left = deadline - now()
    if (!deps.push || left <= 0) return 'failed'
    try {
      const outcome = await within(deps.push.send(target, message), left)
      return outcome === 'sent' || outcome === 'gone' ? outcome : 'failed'
    } catch {
      return 'failed'
    }
  }

  async function sendPush(targets: PushTarget[], message: PushMessage): Promise<{ state: Channel; dead: string[] }> {
    if (!deps.push || targets.length === 0) return { state: 'none', dead: [] }
    const outcomes = await Promise.all(targets.map((t) => sendOne(t, message)))
    const dead = targets.filter((_, i) => outcomes[i] === 'gone').map((t) => t.id)
    const state: Channel = outcomes.includes('sent') ? 'sent' : outcomes.includes('failed') ? 'failed' : 'none'
    return { state, dead }
  }

  // Só o resumo do mês vai por e-mail. O link sai do endereço configurado do site.
  async function sendEmail(kind: string, params: unknown, to: string | null): Promise<Channel> {
    if (kind !== 'month_summary' || !to || !deps.mailer) return 'none'
    const left = deadline - now()
    if (left <= 0) return 'failed'
    try {
      const month = z.object({ month: z.string() }).parse(params).month
      const content = monthSummaryEmail({ month, link: `${siteUrl}/relatorios?periodo=mes-passado` })
      await within(deps.mailer.send({ to, ...content }), left)
      return 'sent'
    } catch {
      return 'failed'
    }
  }

  async function finish(ids: { n_claim: string; n_id: string }, push: Channel, email: Channel, dead: string[]): Promise<boolean> {
    const args = { p_secret: deps.secret, p_claim: ids.n_claim, p_id: ids.n_id, p_push: push, p_email: email, p_dead: dead }
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = Math.min(FINISH_TIMEOUT_MS, hardStop - now())
      if (left <= 0) return false
      let refused = false
      try {
        const { data, error } = await within(deps.db.rpc('job_finish_notification', args), left)
        // false: a linha já não era deste lote (encerramento atrasado). Não se repete.
        if (!error) return data === true
        const code = errorCode(error)
        refused = code !== 'erro' && !TRANSIENT.has(code)
      } catch {
        // rede ou tempo: vale a segunda tentativa
      }
      // Erro passageiro do banco também vale a segunda tentativa: sem o encerramento, a linha já
      // enviada seria enviada de novo em 15 minutos. Se continuar, a linha fica aberta e o banco
      // tenta depois. Recusa do banco não muda numa segunda chamada; depois do limite, não se insiste.
      if (refused || now() >= deadline) return false
    }
    return false
  }

  async function deliverRow(raw: unknown): Promise<void> {
    const ids = idsSchema.safeParse(raw)
    if (!ids.success) {
      result.unconfirmed++ // sem identificação não há como encerrar
      return
    }
    let push: Channel = 'none'
    let email: Channel = 'none'
    let dead: string[] = []
    try {
      const row = rowSchema.safeParse(raw)
      const message = row.success ? notificationMessage(row.data.n_kind, row.data.n_params) : null
      // Dados que não servem: a linha é encerrada sem envio ('none', 'none').
      if (row.success && message) {
        kinds[row.data.n_kind] = (kinds[row.data.n_kind] ?? 0) + 1
        const [pushed, mailed] = await Promise.all([
          sendPush(row.data.n_subscriptions, message),
          sendEmail(row.data.n_kind, row.data.n_params, row.data.n_email),
        ])
        push = pushed.state
        dead = pushed.dead
        email = mailed
      }
    } catch {
      push = 'failed'
    }
    if (push === 'sent' || email === 'sent') result.sent++
    if (push === 'failed' || email === 'failed') result.failed++
    result.removed += dead.length
    if (!(await finish(ids.data, push, email, dead))) result.unconfirmed++
  }

  let lastBatchMs = 0
  for (let batch = 0; ; batch++) {
    // Antes de pegar: só com folga para enviar e encerrar o lote inteiro.
    if (deadline - now() < Math.max(reserve, lastBatchMs * 1.5)) break
    const batchStart = now()
    let rows: unknown[]
    try {
      rows = await claim()
    } catch (error) {
      console.warn('notificacoes: claim', errorCode(error))
      if (batch === 0) throw new Error('claim')
      break
    }
    if (rows.length === 0) break
    result.claimed += rows.length
    await pool(rows, CONCURRENCY, deliverRow)
    lastBatchMs = now() - batchStart
  }

  console.info('notificacoes', { ...result, kinds, push: deps.push !== null, email: deps.mailer !== null })
  return result
}
