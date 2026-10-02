import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { deliverBatch } = await import('./deliver')
const { memoryMailer } = await import('./mailer')

const SECRET = 'S3gredo-da-tarefa_'.repeat(3)
const CLAIM = 'c1a1c1a1-0000-4000-8000-000000000001'
const BILL = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const nid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sub = (n: number) => ({ id: sid(n), endpoint: `https://fcm.googleapis.com/fcm/send/dev${n}`, p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) })
const bill = (over: Record<string, unknown> = {}) => ({
  n_claim: CLAIM, n_id: nid(1), n_kind: 'bill_today', n_params: { name: 'Luz', id: BILL, due_on: '2026-10-01', family: false },
  n_email: null, n_subscriptions: [sub(1)], ...over,
})
const summary = (over: Record<string, unknown> = {}) =>
  bill({ n_kind: 'month_summary', n_params: { month: '2026-09' }, n_email: 'ana@teste.iris.dev', n_subscriptions: [], ...over })

type Reply = { data: unknown; error: unknown }
type Call = { fn: string; args: Record<string, unknown> | undefined }

// O banco de mentira devolve um lote por chamada (e depois lotes vazios).
function fakeDb(batches: unknown[][], opts: { claimError?: unknown; finish?: (args: Record<string, unknown>, nth: number) => Reply | Promise<Reply> } = {}) {
  const calls: Call[] = []
  let claims = 0
  let finishes = 0
  return {
    calls,
    rpc: async (fn: string, args?: Record<string, unknown>): Promise<Reply> => {
      calls.push({ fn, args })
      if (fn === 'job_claim_notifications') {
        if (opts.claimError) return { data: null, error: opts.claimError }
        return { data: batches[claims++] ?? [], error: null }
      }
      if (fn === 'job_finish_notification') return opts.finish ? opts.finish(args ?? {}, finishes++) : { data: true, error: null }
      throw new Error(`rpc inesperada: ${fn}`)
    },
  }
}
const claims = (db: ReturnType<typeof fakeDb>) => db.calls.filter((c) => c.fn === 'job_claim_notifications')
// Em ordem de linha: dentro de um lote os envios correm em paralelo.
const finishes = (db: ReturnType<typeof fakeDb>) =>
  db.calls.filter((c) => c.fn === 'job_finish_notification').map((c) => c.args)
    .sort((a, b) => String(a?.p_id).localeCompare(String(b?.p_id)))
const finish = (id: string, push: string, email: string, dead: string[] = []) =>
  ({ p_secret: SECRET, p_claim: CLAIM, p_id: id, p_push: push, p_email: email, p_dead: dead })

const pushWith = (results: Record<string, 'sent' | 'gone' | 'failed'> = {}) => ({
  send: vi.fn(async (target: { id: string }, _message: unknown) => results[target.id] ?? ('sent' as const)),
})
const base = { secret: SECRET, mailer: null, siteUrl: 'https://iris.app' }
const ZERO = { claimed: 0, sent: 0, failed: 0, removed: 0, unconfirmed: 0 }

let logs: { mock: { calls: unknown[][] } }[] = []
const printed = () => logs.flatMap((l) => l.mock.calls).map((c) => JSON.stringify(c)).join('\n')
beforeEach(() => { logs = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {})) })
afterEach(() => { vi.restoreAllMocks() })

describe('deliverBatch: pegar, enviar e encerrar linha por linha', () => {
  test('pega o lote com o segredo; envia o push com o texto e o destino do aviso; encerra a linha; avisa a inscrição que não vale mais', async () => {
    const db = fakeDb([[bill({ n_subscriptions: [sub(1), sub(2)] })]])
    const push = pushWith({ [sid(2)]: 'gone' })
    const result = await deliverBatch({ ...base, db, push })
    expect(db.calls[0]).toEqual({ fn: 'job_claim_notifications', args: { p_secret: SECRET, p_limit: 20 } })
    expect(push.send).toHaveBeenCalledTimes(2)
    expect(push.send).toHaveBeenCalledWith(sub(1), { body: 'Hoje é o dia de Luz.', url: `/contas?mes=2026-10&pagar=${BILL}`, tag: `bill-${BILL}`, pay: true })
    expect(finishes(db)).toEqual([finish(nid(1), 'sent', 'none', [sid(2)])])
    expect(result).toEqual({ ...ZERO, claimed: 1, sent: 1, removed: 1 })
  })

  test('continua pegando lotes até a fila esvaziar', async () => {
    const db = fakeDb([[bill()], [bill({ n_id: nid(2) })]])
    const result = await deliverBatch({ ...base, db, push: pushWith() })
    expect(claims(db).length).toBe(3) // dois lotes e o vazio que encerra
    expect(finishes(db).map((f) => f?.p_id)).toEqual([nid(1), nid(2)])
    expect(result).toEqual({ ...ZERO, claimed: 2, sent: 2 })
  })

  test('falha no envio: a linha é encerrada como "falhou" (o banco tenta de novo depois) e não se insiste agora', async () => {
    const db = fakeDb([[bill()]])
    const push = pushWith({ [sid(1)]: 'failed' })
    const result = await deliverBatch({ ...base, db, push })
    expect(push.send).toHaveBeenCalledTimes(1)
    expect(finishes(db)).toEqual([finish(nid(1), 'failed', 'none')])
    expect(result).toEqual({ ...ZERO, claimed: 1, failed: 1 })
  })

  test('envio que lança erro conta como falha daquela linha e não derruba o lote', async () => {
    const db = fakeDb([[bill(), bill({ n_id: nid(2), n_subscriptions: [sub(9)] })]])
    const push = { send: vi.fn(async (t: { id: string }) => { if (t.id === sid(1)) throw new Error('rede'); return 'sent' as const }) }
    const result = await deliverBatch({ ...base, db, push })
    expect(finishes(db)).toEqual([finish(nid(1), 'failed', 'none'), finish(nid(2), 'sent', 'none')])
    expect(result).toEqual({ ...ZERO, claimed: 2, sent: 1, failed: 1 })
  })

  test('um aparelho recebeu e outro falhou: o push da linha saiu', async () => {
    const db = fakeDb([[bill({ n_subscriptions: [sub(1), sub(2), sub(3)] })]])
    await deliverBatch({ ...base, db, push: pushWith({ [sid(2)]: 'failed', [sid(3)]: 'gone' }) })
    expect(finishes(db)).toEqual([finish(nid(1), 'sent', 'none', [sid(3)])])
  })

  test('todas as inscrições deixaram de valer: encerra o aviso e manda apagar as inscrições', async () => {
    const db = fakeDb([[bill()]])
    const result = await deliverBatch({ ...base, db, push: pushWith({ [sid(1)]: 'gone' }) })
    expect(finishes(db)).toEqual([finish(nid(1), 'none', 'none', [sid(1)])])
    expect(result).toEqual({ ...ZERO, claimed: 1, removed: 1 })
  })

  test('push desligado (sem chaves): encerra sem enviar, em vez de tentar para sempre', async () => {
    const db = fakeDb([[bill()]])
    const result = await deliverBatch({ ...base, db, push: null })
    expect(finishes(db)).toEqual([finish(nid(1), 'none', 'none')])
    expect(result).toEqual({ ...ZERO, claimed: 1 })
  })

  test('resumo do mês: push e e-mail; o link vem do endereço do site e aponta para Relatórios → Mês passado', async () => {
    const db = fakeDb([[summary({ n_subscriptions: [sub(1)] })]])
    const mailer = memoryMailer()
    const push = pushWith()
    await deliverBatch({ ...base, db, push, mailer, siteUrl: 'https://iris.app/' })
    expect(push.send).toHaveBeenCalledWith(sub(1), expect.objectContaining({ body: 'Seu mês de setembro está fechado. Quer ver como foi?', url: '/relatorios?periodo=mes-passado' }))
    expect(mailer.sent.length).toBe(1)
    expect(mailer.sent[0].to).toBe('ana@teste.iris.dev')
    expect(mailer.sent[0].subject).toBe('Seu mês de setembro está fechado')
    expect(mailer.sent[0].text).toContain('https://iris.app/relatorios?periodo=mes-passado')
    expect(mailer.sent[0].html).toContain('<a href="https://iris.app/relatorios?periodo=mes-passado">Ver meu mês</a>')
    expect(finishes(db)).toEqual([finish(nid(1), 'sent', 'sent')])
  })

  test('cada canal diz o que aconteceu: o push saiu e o e-mail falhou (na próxima tentativa só o e-mail volta)', async () => {
    const db = fakeDb([[summary({ n_subscriptions: [sub(1)] })]])
    const mailer = { send: vi.fn(async () => { throw new Error('smtp') }) }
    const result = await deliverBatch({ ...base, db, push: pushWith(), mailer })
    expect(mailer.send).toHaveBeenCalledTimes(1)
    expect(finishes(db)).toEqual([finish(nid(1), 'sent', 'failed')])
    expect(result).toEqual({ ...ZERO, claimed: 1, sent: 1, failed: 1 })
  })

  test('tentativa seguinte, com o push já enviado (sem inscrições na linha): só o e-mail vai', async () => {
    const db = fakeDb([[summary()]])
    const mailer = memoryMailer()
    const push = pushWith()
    await deliverBatch({ ...base, db, push, mailer })
    expect(push.send).not.toHaveBeenCalled()
    expect(finishes(db)).toEqual([finish(nid(1), 'none', 'sent')])
  })

  test('só o resumo do mês vai por e-mail, mesmo que a linha traga um endereço', async () => {
    const db = fakeDb([[bill({ n_email: 'ana@teste.iris.dev' })]])
    const mailer = memoryMailer()
    await deliverBatch({ ...base, db, push: pushWith(), mailer })
    expect(mailer.sent).toEqual([])
    expect(finishes(db)).toEqual([finish(nid(1), 'sent', 'none')])
  })

  test('e-mail que falha, sem push: fica para a próxima tentativa', async () => {
    const db = fakeDb([[summary()]])
    const mailer = { send: vi.fn(async () => { throw new Error('smtp') }) }
    const result = await deliverBatch({ ...base, db, push: null, mailer })
    expect(finishes(db)).toEqual([finish(nid(1), 'none', 'failed')])
    expect(result).toEqual({ ...ZERO, claimed: 1, failed: 1 })
  })

  test('e-mail desligado (sem servidor configurado): o resumo é encerrado sem e-mail', async () => {
    const db = fakeDb([[summary()]])
    await deliverBatch({ ...base, db, push: null, mailer: null })
    expect(finishes(db)).toEqual([finish(nid(1), 'none', 'none')])
  })

  test('dados que não servem (ou tipo desconhecido): encerra sem enviar', async () => {
    const db = fakeDb([[
      bill({ n_params: { name: '', id: 'x' } }),
      bill({ n_id: nid(2), n_kind: 'outro' }),
      bill({ n_id: nid(3), n_subscriptions: [{ id: 'x', endpoint: 1 }] }),
      bill({ n_id: nid(4), n_subscriptions: Array.from({ length: 11 }, (_, i) => sub(i)) }),
    ]])
    const push = pushWith()
    const result = await deliverBatch({ ...base, db, push })
    expect(push.send).not.toHaveBeenCalled()
    expect(finishes(db)).toEqual([1, 2, 3, 4].map((n) => finish(nid(n), 'none', 'none')))
    expect(result).toEqual({ ...ZERO, claimed: 4 })
  })

  test('linha sem identificação não tem como ser encerrada: é contada, e as outras seguem', async () => {
    const db = fakeDb([[{ lixo: true }, null, bill({ n_claim: 'x' }), bill({ n_id: nid(5) })]])
    const result = await deliverBatch({ ...base, db, push: pushWith() })
    expect(finishes(db)).toEqual([finish(nid(5), 'sent', 'none')])
    expect(result).toEqual({ ...ZERO, claimed: 4, sent: 1, unconfirmed: 3 })
  })

  test('lote vazio: não envia nem encerra nada', async () => {
    const db = fakeDb([])
    expect(await deliverBatch({ ...base, db, push: null })).toEqual(ZERO)
    expect(db.calls.length).toBe(1)
  })

  test('resposta do banco que não é uma lista: lança, sem enviar', async () => {
    const db = fakeDb([{ n_id: nid(1) } as unknown as unknown[]])
    await expect(deliverBatch({ ...base, db, push: null })).rejects.toThrow()
    expect(finishes(db)).toEqual([])
  })

  test('erro ao pegar o lote: lança, e nada é encerrado', async () => {
    const db = fakeDb([], { claimError: { message: `permission denied ${SECRET}`, code: '42501' } })
    await expect(deliverBatch({ ...base, db, push: null })).rejects.toThrow(/^claim$/)
    expect(finishes(db)).toEqual([])
    expect(printed()).toContain('42501')
    expect(printed()).not.toContain('permission denied')
  })

  test('erro ao pegar um lote seguinte: para por ali e devolve o que já foi entregue', async () => {
    let n = 0
    const calls: Call[] = []
    const db = {
      rpc: async (fn: string, args?: Record<string, unknown>): Promise<Reply> => {
        calls.push({ fn, args })
        if (fn === 'job_finish_notification') return { data: true, error: null }
        return n++ === 0 ? { data: [bill()], error: null } : { data: null, error: { code: '57014' } }
      },
    }
    const result = await deliverBatch({ ...base, db, push: pushWith() })
    expect(result).toEqual({ ...ZERO, claimed: 1, sent: 1 })
    expect(calls.map((c) => c.fn)).toEqual(['job_claim_notifications', 'job_finish_notification', 'job_claim_notifications'])
  })
})

describe('deliverBatch: toda linha pega é encerrada, dentro do tempo', () => {
  test('vinte linhas com resultados misturados: um encerramento por linha, no máximo cinco envios ao mesmo tempo', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => bill({ n_id: nid(i + 1), n_subscriptions: [sub(i + 1)] }))
    const db = fakeDb([rows])
    let running = 0
    let peak = 0
    const push = {
      send: vi.fn(async (t: { id: string }) => {
        running++
        peak = Math.max(peak, running)
        await new Promise((r) => setTimeout(r, 2))
        running--
        const n = Number(t.id.slice(-12))
        if (n % 5 === 0) throw new Error('rede')
        return n % 3 === 0 ? ('failed' as const) : n % 7 === 0 ? ('gone' as const) : ('sent' as const)
      }),
    }
    const result = await deliverBatch({ ...base, db, push })
    const done = finishes(db)
    expect(done.length).toBe(20)
    expect(new Set(done.map((f) => f?.p_id)).size).toBe(20)
    expect(push.send).toHaveBeenCalledTimes(20) // uma tentativa por aparelho, sem insistir
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(5)
    expect(result.claimed).toBe(20)
    expect(result.sent + result.failed + done.filter((f) => f?.p_push === 'none').length).toBe(20)
    expect(result.unconfirmed).toBe(0)
  })

  test('confere o tempo ANTES de pegar outro lote: sem folga, não pega', async () => {
    let clock = 0
    const db = fakeDb([[bill()], [bill({ n_id: nid(2) })]])
    const push = { send: vi.fn(async () => { clock += 4000; return 'sent' as const }) }
    const result = await deliverBatch({ ...base, db, push, now: () => clock })
    expect(claims(db).length).toBe(1) // restam 2 s de 6 s: menos que a folga
    expect(finishes(db)).toEqual([finish(nid(1), 'sent', 'none')])
    expect(result).toEqual({ ...ZERO, claimed: 1, sent: 1 })
  })

  test('a folga cresce com a demora do lote anterior', async () => {
    let clock = 0
    const db = fakeDb([[bill()], [bill({ n_id: nid(2) })]])
    const push = { send: vi.fn(async () => { clock += 2500; return 'sent' as const }) }
    await deliverBatch({ ...base, db, push, now: () => clock })
    // Restam 3,5 s, mais que a folga mínima, mas o lote anterior levou 2,5 s (e pede 3,75 s).
    expect(claims(db).length).toBe(1)
  })

  test('com tempo de sobra, pega o lote seguinte', async () => {
    let clock = 0
    const db = fakeDb([[bill()], [bill({ n_id: nid(2) })]])
    const push = { send: vi.fn(async () => { clock += 500; return 'sent' as const }) }
    const result = await deliverBatch({ ...base, db, push, now: () => clock })
    expect(claims(db).length).toBe(3)
    expect(result.sent).toBe(2)
  })

  test('tempo esgotado no meio do lote: o que ainda não saiu não é mais enviado, mas TODA linha pega é encerrada', async () => {
    let clock = 0
    const rows = Array.from({ length: 7 }, (_, i) => bill({ n_id: nid(i + 1), n_subscriptions: [sub(i + 1)] }))
    const db = fakeDb([rows, [bill({ n_id: nid(99) })]])
    const push = { send: vi.fn(async () => { clock += 7000; return 'sent' as const }) }
    const result = await deliverBatch({ ...base, db, push, now: () => clock })
    expect(push.send).toHaveBeenCalledTimes(1)
    const done = finishes(db)
    expect(done.length).toBe(7)
    expect(done.filter((f) => f?.p_push === 'sent').map((f) => f?.p_id)).toEqual([nid(1)])
    expect(done.filter((f) => f?.p_push === 'failed').length).toBe(6)
    expect(claims(db).length).toBe(1)
    expect(result).toEqual({ ...ZERO, claimed: 7, sent: 1, failed: 6 })
  })

  test('envio que nunca responde: é abandonado no limite do tempo e a linha é encerrada como "falhou"', async () => {
    const db = fakeDb([[summary({ n_subscriptions: [sub(1)] })]])
    const push = { send: vi.fn(() => new Promise<'sent'>(() => {})) }
    const mailer = { send: vi.fn(() => new Promise<void>(() => {})) }
    const result = await deliverBatch({ ...base, db, push, mailer, budgetMs: 40, reserveMs: 5 })
    expect(finishes(db)).toEqual([finish(nid(1), 'failed', 'failed')])
    expect(result).toEqual({ ...ZERO, claimed: 1, failed: 1 })
  })

  test('encerramento que o banco não reconhece (linha de outro lote, ou já encerrada): conta, não repete', async () => {
    const db = fakeDb([[bill()]], { finish: () => ({ data: false, error: null }) })
    const result = await deliverBatch({ ...base, db, push: pushWith() })
    expect(finishes(db).length).toBe(1)
    expect(result).toEqual({ ...ZERO, claimed: 1, sent: 1, unconfirmed: 1 })
  })

  test('encerramento que falha na rede: uma segunda tentativa, só uma', async () => {
    const ok = fakeDb([[bill()]], { finish: (_a, nth) => (nth === 0 ? { data: null, error: { message: 'fetch failed' } } : { data: true, error: null }) })
    expect(await deliverBatch({ ...base, db: ok, push: pushWith() })).toEqual({ ...ZERO, claimed: 1, sent: 1 })
    expect(finishes(ok).length).toBe(2)

    const down = fakeDb([[bill()]], { finish: () => { throw new Error('fetch failed') } })
    expect(await deliverBatch({ ...base, db: down, push: pushWith() })).toEqual({ ...ZERO, claimed: 1, sent: 1, unconfirmed: 1 })
    expect(finishes(down).length).toBe(2)
  })

  test('encerramento recusado pelo banco (segredo): não insiste', async () => {
    const db = fakeDb([[bill()]], { finish: () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) })
    const result = await deliverBatch({ ...base, db, push: pushWith() })
    expect(finishes(db).length).toBe(1)
    expect(result.unconfirmed).toBe(1)
  })
})

describe('deliverBatch: o que vai para o log', () => {
  test('uma linha por execução, só com números, tipos e canais ligados', async () => {
    const db = fakeDb([[bill(), summary({ n_id: nid(2) })]])
    await deliverBatch({ ...base, db, push: pushWith(), mailer: memoryMailer() })
    const lines = logs.flatMap((l) => l.mock.calls)
    expect(lines).toEqual([['notificacoes', {
      claimed: 2, sent: 2, failed: 0, removed: 0, unconfirmed: 0, kinds: { bill_today: 1, month_summary: 1 }, push: true, email: true,
    }]])
  })

  test('nada pessoal nem secreto: nem endereço de push, nem chaves, nem e-mail, nem nome da conta, nem o segredo', async () => {
    const db = fakeDb([[bill({ n_email: 'ana@teste.iris.dev' }), summary({ n_id: nid(2), n_subscriptions: [sub(2)] })]])
    const mailer = { send: vi.fn(async () => { throw new Error('smtp ana@teste.iris.dev') }) }
    const push = { send: vi.fn(async () => { throw new Error(`falhou em ${sub(1).endpoint}`) }) }
    await deliverBatch({ ...base, db, push, mailer })
    for (const secret of ['fcm.googleapis.com', 'ana@teste.iris.dev', 'Luz', 'AAAA', SECRET, CLAIM, nid(1), sid(1), 'smtp']) {
      expect(printed()).not.toContain(secret)
    }
  })
})
