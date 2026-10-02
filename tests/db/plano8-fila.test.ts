import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, joinFamily, todaySP } from './family-helpers'
import { addDaysISO, endpoint, logRows, monthStart, pendingBill, subscribe, subscriptionsOf } from './notify-helpers'

// A rota da tarefa usa a chave pública sem sessão: é este cliente.
const anon = createClient(url, publishable, { auth: { persistSession: false } })
const today = todaySP()
const tomorrow = addDaysISO(today, 1)

// O segredo da tarefa destes testes. O banco recebe só o SHA-256 dele, com um rótulo próprio
// (o de quem desenvolve, se houver, não é tocado).
const SECRET = randomBytes(32).toString('base64url')
const LABEL = 'teste-fila'
const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex')
const registerSecret = async (label = LABEL, secret: string | null = SECRET) => {
  const r = await admin.rpc('job_secret_set', { p_label: label, p_hash_hex: secret === null ? null : sha256Hex(secret) })
  if (r.error) throw r.error
}

beforeAll(async () => { await registerSecret() })
afterAll(async () => { await registerSecret(LABEL, null) })

type Claimed = {
  n_claim: string; n_id: string; n_kind: string; n_params: Record<string, unknown>
  n_email: string | null; n_subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[]
}
type Channel = 'sent' | 'none' | 'failed'

const morning = async (day = today) => {
  const r = await admin.rpc('job_enqueue_morning_on', { p_today: day })
  if (r.error) throw r.error
}
const claimOnce = async (limit: number | null = 50): Promise<Claimed[]> => {
  const r = await anon.rpc('job_claim_notifications', { p_secret: SECRET, p_limit: limit })
  if (r.error) throw r.error
  return r.data as Claimed[]
}
// Quantas linhas ainda podem ser pegas (as mesmas condições da função).
async function claimable(): Promise<number> {
  const r = await admin.from('notification_log').select('id', { count: 'exact', head: true })
    .is('sent_at', null).lt('attempts', 3)
    .gt('created_at', new Date(Date.now() - 2 * 86_400_000).toISOString())
    .or(`claimed_at.is.null,claimed_at.lt.${new Date(Date.now() - 15 * 60_000).toISOString()}`)
  if (r.error) throw r.error
  return r.count ?? 0
}
// Pega tudo o que está na fila, em lotes de até 50, como a rota faz.
const claim = async (): Promise<Claimed[]> => {
  const all: Claimed[] = []
  for (let i = 0; i < 40; i++) {
    const got = await claimOnce()
    all.push(...got)
    if (got.length === 0 && (await claimable()) === 0) break
  }
  return all
}
// A função não devolve de quem é a linha: os testes descobrem pela fila.
const mine = async (rows: Claimed[], u: TestUser): Promise<Claimed[]> => {
  const ids = new Set((await logRows(u.id)).map((r) => r.id))
  return rows.filter((r) => ids.has(r.n_id))
}
const finish = (
  row: { n_claim: string; n_id: string }, push: Channel | string = 'sent', email: Channel | string = 'none',
  dead: string[] = [], client: SupabaseClient = anon, secret: string | null = SECRET,
) => client.rpc('job_finish_notification', { p_secret: secret, p_claim: row.n_claim, p_id: row.n_id, p_push: push, p_email: email, p_dead: dead })
const state = async (id: string) => {
  const { data, error } = await admin.from('notification_log')
    .select('sent_at, push_sent_at, email_sent_at, attempts, claim_id, claimed_at').eq('id', id).single()
  if (error) throw error
  return data as { sent_at: string | null; push_sent_at: string | null; email_sent_at: string | null; attempts: number; claim_id: string | null; claimed_at: string | null }
}
// Faz de conta que a linha foi pega há mais tempo (para a próxima tentativa, ou para um encerramento atrasado).
const age = async (id: string, minutes = 20) => {
  const { error } = await admin.from('notification_log').update({ claimed_at: new Date(Date.now() - minutes * 60_000).toISOString() }).eq('id', id)
  if (error) throw error
}
const kinds = async (u: TestUser) => (await logRows(u.id)).map((r) => `${r.kind}:${r.ref}`).sort()
// Registro confirmado gravado pelo cliente administrativo, com data e horário escolhidos.
async function confirmed(u: TestUser, occurredOn: string, at?: string): Promise<string> {
  const { data, error } = await admin.from('transactions').insert({
    user_id: u.id, kind: 'expense', amount_cents: 1000, category_id: await categoryId(u, 'mercado'), occurred_on: occurredOn,
    ...(at ? { created_at: at, updated_at: at } : {}),
  }).select('id').single()
  if (error) throw error
  return data.id as string
}

describe('enfileirar de manhã (9h de Brasília)', () => {
  let a: TestUser, b: TestUser, c: TestUser, d: TestUser, out: TestUser, e: TestUser
  let family: string
  beforeAll(async () => {
    a = await newUser('Ana'); b = await newUser('Bia'); c = await newUser('Caio'); d = await newUser('Dan'); out = await newUser('Eli'); e = await newUser('Eva')
    family = await createFamily(a, 'Família Manhã')
    await joinFamily(c, a)
    await joinFamily(d, a)
    const left = await d.client.rpc('leave_family')
    if (left.error) throw left.error
    for (const u of [a, c, d, out, e]) await subscribe(u)
    // Os avisos de saída do Dan não interessam a estes testes.
    await admin.from('notification_log').delete().in('user_id', [a.id, c.id])
  })
  afterAll(async () => { await removeUsers(c, d, b, out, e, a) })

  test('conta pessoal: "vence amanhã" e "hoje é o dia"; vencida, paga e de quem não tem aparelho, nada; rodar duas vezes não duplica', async () => {
    const t1 = await pendingBill(a, { name: 'Luz', dueOn: tomorrow })
    const t2 = await pendingBill(a, { name: 'Água', dueOn: today })
    await pendingBill(a, { name: 'Vencida', dueOn: addDaysISO(today, -1) })
    const paid = await pendingBill(a, { name: 'Paga', dueOn: today })
    await admin.from('transactions').update({ status: 'confirmed', paid_on: today }).eq('id', paid)
    await pendingBill(b, { name: 'Sem aparelho', dueOn: today })
    await morning()
    expect(await kinds(a)).toEqual([`bill_today:${t2}`, `bill_tomorrow:${t1}`].sort())
    expect(await kinds(b)).toEqual([])
    await morning()
    expect((await logRows(a.id)).length).toBe(2)
  })

  test('chave "Contas perto do vencimento" desligada: nenhum aviso de conta', async () => {
    await out.client.from('notification_prefs').upsert({ user_id: out.id, kind: 'bills', enabled: false })
    await pendingBill(out, { name: 'Gás', dueOn: today })
    await morning()
    expect(await kinds(out)).toEqual([])
  })

  test('conta da família: avisa quem participa e tem aparelho, e só eles', async () => {
    const bill = await pendingBill(c, { name: 'Internet', dueOn: today, familyId: family })
    await morning()
    expect(await kinds(c)).toContain(`bill_today:${bill}`)
    expect(await kinds(a)).toContain(`bill_today:${bill}`)
    expect(await kinds(d)).toEqual([]) // saiu da família
    expect(await kinds(out)).toEqual([])
  })

  test('entrada a receber hoje', async () => {
    const inc = await pendingBill(e, { name: 'Salário', dueOn: today, kind: 'income' })
    await pendingBill(e, { name: 'Freela', dueOn: tomorrow, kind: 'income' })
    await morning()
    expect(await kinds(e)).toEqual([`income_today:${inc}`])
  })

  test('retomada: depois de 5 dias sem registro, uma vez por intervalo; quem registrou há pouco não recebe', async () => {
    const last = addDaysISO(today, -6)
    await confirmed(d, last, `${last}T15:00:00Z`)
    await confirmed(out, today)
    await morning()
    expect(await kinds(d)).toEqual([`comeback:${last}`])
    expect((await kinds(out)).some((k) => k.startsWith('comeback'))).toBe(false)
    await morning(addDaysISO(today, 1))
    expect((await kinds(d)).filter((k) => k.startsWith('comeback'))).toEqual([`comeback:${last}`])
  })

  test('resumo do mês: só no dia 1, para quem teve registro no mês fechado, com ou sem aparelho', async () => {
    await confirmed(b, '2031-03-15')
    await morning('2031-04-02')
    expect((await kinds(b)).some((k) => k.startsWith('month_summary'))).toBe(false)
    await morning('2031-04-01')
    expect(await kinds(b)).toContain('month_summary:2031-03')
    expect((await kinds(e)).some((k) => k.startsWith('month_summary'))).toBe(false) // sem registro em março de 2031
    await morning('2031-04-01')
    expect((await kinds(b)).filter((k) => k.startsWith('month_summary')).length).toBe(1)
  })
})

describe('enfileirar à noite (21h): lembrete para anotar (RF-47)', () => {
  let on: TestUser, wrote: TestUser, standard: TestUser
  beforeAll(async () => {
    on = await newUser('Liz'); wrote = await newUser('Rui'); standard = await newUser('Sam')
    for (const u of [on, wrote, standard]) await subscribe(u)
    for (const u of [on, wrote]) await u.client.from('notification_prefs').upsert({ user_id: u.id, kind: 'daily', enabled: true })
    await confirmed(wrote, today)
  })
  afterAll(async () => { await removeUsers(on, wrote, standard) })

  test('só para quem ligou, e só se ainda não anotou nada hoje', async () => {
    const r = await admin.rpc('job_enqueue_evening_on', { p_today: today })
    expect(r.error).toBeNull()
    expect(await kinds(on)).toEqual([`daily_reminder:${today}`])
    expect(await kinds(wrote)).toEqual([])
    expect(await kinds(standard)).toEqual([]) // desligado por padrão
    await admin.rpc('job_enqueue_evening_on', { p_today: today })
    expect((await logRows(on.id)).length).toBe(1)
  })
})

describe('o segredo da tarefa', () => {
  let p: TestUser
  let rowId: string
  const FAKE = { n_claim: randomUUID(), n_id: randomUUID() }
  beforeAll(async () => {
    await claim() // nada de outros testes fica na fila
    p = await newUser('Pia')
    await subscribe(p)
    const bill = await pendingBill(p, { name: 'Luz', dueOn: today })
    await morning()
    rowId = (await logRows(p.id)).find((r) => r.ref === bill)!.id
  })
  afterAll(async () => { await registerSecret('teste-curto', null); await removeUsers(p) })

  const untouched = async () => expect(await state(rowId)).toEqual({
    sent_at: null, push_sent_at: null, email_sent_at: null, attempts: 0, claim_id: null, claimed_at: null,
  })

  test('sem o segredo certo, a mesma recusa para tudo: errado, vazio, ausente, curto demais', async () => {
    const short = 'curto-demais-1234567'
    await registerSecret('teste-curto', short) // gravado, mas com menos de 43 caracteres: não vale
    const bad: (string | null)[] = [randomBytes(32).toString('base64url'), `${SECRET}x`, SECRET.slice(0, -1), SECRET.toLowerCase(), '', null, short, 'a'.repeat(200)]
    const failures: { code?: string; message?: string }[] = []
    for (const secret of bad) {
      const c = await anon.rpc('job_claim_notifications', { p_secret: secret, p_limit: 10 })
      const f = await finish({ n_claim: FAKE.n_claim, n_id: rowId }, 'sent', 'none', [], anon, secret)
      const t = await anon.rpc('job_trigger', { p_secret: secret, p_job: 'ocorrencias' })
      for (const r of [c, f, t]) {
        expect(r.error?.code, String(secret)).toBe('42501')
        expect(r.data ?? null).toBeNull()
        failures.push({ code: r.error?.code, message: r.error?.message })
      }
    }
    // Nenhuma pista sobre o motivo: todas as recusas são iguais.
    expect(new Set(failures.map((f) => `${f.code}|${f.message}`)).size).toBe(1)
    await untouched()
  })

  test('a chamada sem o parâmetro do segredo não existe', async () => {
    for (const client of [anon, p.client]) {
      const c = await client.rpc('job_claim_notifications', { p_limit: 10 })
      expect(c.error).not.toBeNull()
      expect(c.data ?? null).toBeNull()
      const f = await client.rpc('job_finish_notifications', { p_sent: [rowId], p_dead: [] })
      expect(f.error).not.toBeNull()
    }
    await untouched()
  })

  test('uma pessoa com sessão não roda a tarefa, nem com o segredo certo', async () => {
    const c = await p.client.rpc('job_claim_notifications', { p_secret: SECRET, p_limit: 10 })
    expect(c.error?.code).toBe('42501')
    expect(c.data ?? null).toBeNull()
    expect((await finish({ n_claim: FAKE.n_claim, n_id: rowId }, 'sent', 'none', [], p.client)).error?.code).toBe('42501')
    expect((await p.client.rpc('job_trigger', { p_secret: SECRET, p_job: 'ocorrencias' })).error?.code).toBe('42501')
    await untouched()
    expect((await subscriptionsOf(p.id)).length).toBe(1)
  })

  test('ninguém grava, apaga nem lê o resumo do segredo pela API', async () => {
    for (const client of [anon, p.client]) {
      expect((await client.rpc('job_secret_set', { p_label: LABEL, p_hash_hex: null })).error?.code).toBe('42501')
      expect((await client.rpc('job_secret_set', { p_label: 'meu', p_hash_hex: sha256Hex('x'.repeat(43)) })).error?.code).toBe('42501')
      expect((await client.rpc('job_secret_ok', { p_secret: SECRET })).error).not.toBeNull()
      expect((await client.rpc('job_require', { p_secret: SECRET })).error).not.toBeNull()
    }
    // O esquema private não é exposto pela API, nem para a chave de serviço.
    for (const client of [anon, p.client, admin]) {
      const r = await client.schema('private').from('job_secrets').select('label')
      expect(r.error).not.toBeNull()
      expect(r.data ?? null).toBeNull()
    }
    // O segredo dos testes continua valendo (ninguém o apagou acima).
    expect((await anon.rpc('job_trigger', { p_secret: SECRET, p_job: 'nenhuma' })).error).toBeNull()
  })

  test('só o resumo em hexadecimal é aceito; o rótulo tem forma fixa', async () => {
    for (const [label, hash] of [['teste-x', 'abc'], ['teste-x', SECRET], ['teste-x', sha256Hex('a').toUpperCase()], ['Rótulo!', sha256Hex('a')], ['', sha256Hex('a')]]) {
      expect((await admin.rpc('job_secret_set', { p_label: label, p_hash_hex: hash })).error?.message, `${label}/${hash}`).toContain('Segredo inválido.')
    }
  })

  test('com o segredo certo e sem sessão, a tarefa roda; apagado o resumo, deixa de rodar', async () => {
    await registerSecret(LABEL, null)
    expect((await anon.rpc('job_claim_notifications', { p_secret: SECRET, p_limit: 10 })).error?.code).toBe('42501')
    await untouched()
    await registerSecret()

    expect((await anon.rpc('job_trigger', { p_secret: SECRET, p_job: 'nenhuma' })).data).toBeNull() // tarefa desconhecida: nada
    const ran = await anon.rpc('job_trigger', { p_secret: SECRET, p_job: 'ocorrencias' })
    expect(ran.error).toBeNull()
    expect(typeof ran.data).toBe('number')

    const got = await mine(await claim(), p)
    expect(got.map((r) => r.n_id)).toEqual([rowId])
    expect((await state(rowId)).attempts).toBe(1)
    expect((await finish(got[0])).data).toBe(true)
    expect((await state(rowId)).sent_at).not.toBeNull()
  })
})

describe('entregar o lote', () => {
  let a: TestUser, c: TestUser, out: TestUser, s: TestUser
  let family: string
  let first: Claimed, summary: Claimed
  beforeAll(async () => {
    await claim()
    a = await newUser('Ana'); c = await newUser('Caio'); out = await newUser('Eli'); s = await newUser('Sol')
    family = await createFamily(a, 'Família Lote')
    await joinFamily(c, a)
    for (const u of [a, c, out]) await subscribe(u)
  })
  afterAll(async () => { await removeUsers(c, out, s, a) })

  test('devolve os dados do aviso e as inscrições, e marca a tentativa; a mesma linha não sai duas vezes seguidas', async () => {
    const bill = await pendingBill(a, { name: 'Luz', dueOn: today })
    await morning()
    const got = await mine(await claim(), a)
    expect(got.length).toBe(1)
    expect(got[0].n_kind).toBe('bill_today')
    expect(got[0].n_params).toEqual({ name: 'Luz', id: bill, due_on: today, family: false })
    expect(got[0].n_email).toBeNull()
    expect(got[0].n_subscriptions.map((x) => Object.keys(x).sort())).toEqual([['auth', 'endpoint', 'id', 'p256dh']])
    // Só o que a entrega precisa: o id da pessoa não sai do banco.
    expect(Object.keys(got[0]).sort()).toEqual(['n_claim', 'n_email', 'n_id', 'n_kind', 'n_params', 'n_subscriptions'])
    expect(JSON.stringify(got[0])).not.toContain(a.id)
    expect((await logRows(a.id))[0]).toMatchObject({ attempts: 1, sent_at: null })
    expect((await state(got[0].n_id)).claim_id).toBe(got[0].n_claim)
    expect(await mine(await claim(), a)).toEqual([])
    first = got[0]
  })

  test('finalizar: marca como enviado e apaga as inscrições que não valem mais', async () => {
    const row = (await logRows(a.id))[0]
    const sub = (await subscriptionsOf(a.id))[0]
    expect(row.id).toBe(first.n_id)
    const done = await finish(first, 'sent', 'none', [sub.id])
    expect(done.error).toBeNull()
    expect(done.data).toBe(true)
    expect((await logRows(a.id))[0].sent_at).not.toBeNull()
    const after = await state(first.n_id)
    expect(after.push_sent_at).not.toBeNull()
    expect(after.email_sent_at).toBeNull()
    expect(await subscriptionsOf(a.id)).toEqual([])
    // Linha encerrada não é encerrada de novo (nem reaberta).
    expect((await finish(first, 'failed', 'failed')).data).toBe(false)
    expect(await state(first.n_id)).toEqual(after)
    await subscribe(a)
  })

  test('conta paga antes do envio não gera aviso', async () => {
    const bill = await pendingBill(a, { name: 'Gás', dueOn: today })
    await morning()
    await admin.from('transactions').update({ status: 'confirmed', paid_on: today }).eq('id', bill)
    expect(await mine(await claim(), a)).toEqual([])
    expect((await logRows(a.id)).find((r) => r.ref === bill)?.sent_at).not.toBeNull()
  })

  test('desligar antes do envio cancela', async () => {
    const bill = await pendingBill(out, { name: 'Luz', dueOn: today })
    await morning()
    await out.client.from('notification_prefs').upsert({ user_id: out.id, kind: 'bills', enabled: false })
    expect(await mine(await claim(), out)).toEqual([])
    expect((await logRows(out.id)).find((r) => r.ref === bill)?.sent_at).not.toBeNull()
    await out.client.from('notification_prefs').upsert({ user_id: out.id, kind: 'bills', enabled: true })
  })

  test('desativar o aparelho antes do envio: a linha é encerrada sem sair do banco', async () => {
    const ep = (await subscriptionsOf(out.id))[0].endpoint
    const bill = await pendingBill(out, { name: 'Telefone', dueOn: today })
    await morning()
    expect((await out.client.rpc('delete_push_subscription', { p_endpoint: ep })).error).toBeNull()
    expect(await mine(await claim(), out)).toEqual([])
    const row = (await logRows(out.id)).find((r) => r.ref === bill)!
    expect(row).toMatchObject({ attempts: 0 })
    expect(row.sent_at).not.toBeNull()
    await subscribe(out)
  })

  test('quem saiu da família não recebe o aviso da conta da família', async () => {
    const bill = await pendingBill(a, { name: 'Aluguel', dueOn: today, familyId: family })
    await morning()
    expect((await logRows(c.id)).some((r) => r.ref === bill)).toBe(true)
    const left = await c.client.rpc('leave_family')
    expect(left.error).toBeNull()
    const got = await claim()
    expect((await mine(got, c)).filter((r) => r.n_params.id === bill)).toEqual([])
    expect((await mine(got, a)).find((r) => r.n_params.id === bill)?.n_params).toEqual({ name: 'Aluguel', id: bill, due_on: today, family: true })
    // A linha de quem saiu foi encerrada sem envio: não volta numa próxima tentativa.
    const closed = (await logRows(c.id)).find((r) => r.ref === bill)!
    expect(closed).toMatchObject({ attempts: 0 })
    expect(closed.sent_at).not.toBeNull()
    expect(got.some((r) => r.n_id === closed.id)).toBe(false)
  })

  test('linha forjada com a conta de outra pessoa não devolve nada', async () => {
    const bill = await pendingBill(a, { name: 'Privada', dueOn: today })
    const forged = await admin.from('notification_log').insert({ user_id: out.id, kind: 'bill_today', ref: bill }).select('id').single()
    expect(forged.error).toBeNull()
    const got = await claim()
    expect(await mine(got, out)).toEqual([])
    expect(JSON.stringify(got)).not.toContain('Privada')
    expect((await logRows(out.id)).find((r) => r.id === forged.data!.id)?.sent_at).not.toBeNull()
  })

  test('linha forjada com a entrada de outra pessoa: entrada a receber só vai para quem é dona dela', async () => {
    const income = await pendingBill(a, { name: 'Salário da Ana', dueOn: today, kind: 'income' })
    const forged = await admin.from('notification_log').insert({ user_id: out.id, kind: 'income_today', ref: income }).select('id').single()
    expect(forged.error).toBeNull()
    await morning()
    const got = await claim()
    expect(await mine(got, out)).toEqual([])
    expect((await mine(got, a)).filter((r) => r.n_kind === 'income_today').map((r) => r.n_params))
      .toEqual([{ name: 'Salário da Ana', id: income, due_on: today, family: false }])
    expect((await logRows(out.id)).find((r) => r.id === forged.data!.id)?.sent_at).not.toBeNull()
  })

  test('resumo do mês leva o e-mail de quem recebe, mesmo sem aparelho; os outros tipos nunca', async () => {
    await confirmed(s, '2031-05-10')
    await morning('2031-06-01')
    const all = await claim()
    const got = await mine(all, s)
    expect(got.map((r) => [r.n_kind, r.n_params, r.n_subscriptions])).toEqual([['month_summary', { month: '2031-05' }, []]])
    expect(got[0].n_email).toBe((await admin.auth.admin.getUserById(s.id)).data.user!.email)
    expect(all.filter((r) => r.n_kind !== 'month_summary').every((r) => r.n_email === null)).toBe(true)
    summary = got[0]
  })

  test('cada canal é registrado por si: o que já saiu não se repete na nova tentativa', async () => {
    const email = (await admin.auth.admin.getUserById(s.id)).data.user!.email
    // 1ª tentativa: sem aparelho, e o e-mail falhou. A linha fica aberta.
    expect((await finish(summary, 'none', 'failed')).data).toBe(true)
    expect(await state(summary.n_id)).toMatchObject({ sent_at: null, push_sent_at: null, email_sent_at: null, attempts: 1 })
    expect(await mine(await claim(), s)).toEqual([]) // só depois de 15 minutos

    // 2ª tentativa: agora há um aparelho. O push sai, o e-mail falha de novo.
    await subscribe(s)
    await age(summary.n_id)
    const second = await mine(await claim(), s)
    expect(second.length).toBe(1)
    expect(second[0].n_claim).not.toBe(summary.n_claim)
    expect(second[0].n_email).toBe(email)
    expect(second[0].n_subscriptions.length).toBe(1)
    // O encerramento atrasado da 1ª tentativa não mexe na linha, que agora é de outro lote.
    expect((await finish(summary, 'sent', 'sent')).data).toBe(false)
    expect(await state(summary.n_id)).toMatchObject({ sent_at: null, push_sent_at: null, email_sent_at: null, attempts: 2 })
    expect((await finish(second[0], 'sent', 'failed')).data).toBe(true)
    const afterPush = await state(summary.n_id)
    expect(afterPush.push_sent_at).not.toBeNull()
    expect(afterPush).toMatchObject({ sent_at: null, email_sent_at: null })

    // 3ª tentativa: o push não é repetido (nenhuma inscrição devolvida); só o e-mail.
    await age(summary.n_id)
    const third = await mine(await claim(), s)
    expect(third.length).toBe(1)
    expect(third[0].n_subscriptions).toEqual([])
    expect(third[0].n_email).toBe(email)
    expect((await finish(third[0], 'none', 'sent')).data).toBe(true)
    const done = await state(summary.n_id)
    expect(done.sent_at).not.toBeNull()
    expect(done.email_sent_at).not.toBeNull()
    expect(done.push_sent_at).toBe(afterPush.push_sent_at)
    expect(done.attempts).toBe(3)
    await age(summary.n_id)
    expect(await mine(await claim(), s)).toEqual([])
  })

  test('meta perto: o aviso leva só o nome e quanto falta', async () => {
    const goal = (await out.client.from('goals').insert({ user_id: out.id, name: 'Viagem', target_cents: 100000 }).select('id').single()).data!.id
    await out.client.rpc('deposit_to_goal', { p_goal_id: goal, p_amount_cents: 95000 })
    expect((await out.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(1)
    const got = (await mine(await claim(), out)).filter((r) => r.n_kind === 'goal_near')
    expect(got.map((r) => r.n_params)).toEqual([{ name: 'Viagem', id: goal, remaining_cents: 5000 }])
  })

  test('retomada: quem voltou a anotar antes do envio não recebe o aviso', async () => {
    const away = await newUser('Ivo'), back = await newUser('Lua')
    try {
      const last = addDaysISO(today, -7)
      for (const u of [away, back]) {
        await subscribe(u)
        await confirmed(u, last, `${last}T15:00:00Z`)
      }
      await morning()
      expect(await kinds(away)).toEqual([`comeback:${last}`])
      expect(await kinds(back)).toEqual([`comeback:${last}`])
      await confirmed(back, today) // voltou a anotar antes do envio
      const got = await claim()
      expect((await mine(got, away)).map((r) => [r.n_kind, r.n_params])).toEqual([['comeback', {}]])
      expect(await mine(got, back)).toEqual([])
      const closed = (await logRows(back.id))[0]
      expect(closed).toMatchObject({ kind: 'comeback', attempts: 0 })
      expect(closed.sent_at).not.toBeNull()
    } finally {
      await removeUsers(away, back)
    }
  })

  test('depois de 3 tentativas a linha não volta', async () => {
    const bill = await pendingBill(a, { name: 'Teimosa', dueOn: today })
    await morning()
    const past = new Date(Date.now() - 20 * 60_000).toISOString()
    for (let i = 1; i <= 3; i++) {
      expect((await mine(await claim(), a)).some((r) => r.n_params.id === bill), `tentativa ${i}`).toBe(true)
      await admin.from('notification_log').update({ claimed_at: past }).eq('user_id', a.id).eq('ref', bill)
    }
    expect((await mine(await claim(), a)).some((r) => r.n_params.id === bill)).toBe(false)
    expect((await logRows(a.id)).find((r) => r.ref === bill)).toMatchObject({ attempts: 3, sent_at: null })
  })
})

describe('tamanho do lote', () => {
  let u: TestUser
  beforeAll(async () => {
    await claim()
    u = await newUser('Lia')
    await subscribe(u)
    // 75 avisos de retomada com dias diferentes (a pessoa não tem registro nenhum depois deles).
    const rows = Array.from({ length: 75 }, (_, i) => ({ user_id: u.id, kind: 'comeback', ref: addDaysISO('2030-01-01', i) }))
    const ins = await admin.from('notification_log').insert(rows)
    if (ins.error) throw ins.error
  })
  afterAll(async () => { await removeUsers(u) })

  test('20 por padrão, 50 no máximo, 1 no mínimo; cada chamada é um lote', async () => {
    const byDefault = await claimOnce(null)
    expect(byDefault.length).toBe(20)
    const capped = await claimOnce(1000)
    expect(capped.length).toBe(50)
    const one = await claimOnce(0)
    expect(one.length).toBe(1)
    expect(await claimOnce(-5)).toHaveLength(1)
    expect(new Set(byDefault.map((r) => r.n_claim)).size).toBe(1)
    expect(new Set(capped.map((r) => r.n_claim)).size).toBe(1)
    expect(new Set([byDefault[0].n_claim, capped[0].n_claim, one[0].n_claim]).size).toBe(3)
    expect(new Set([...byDefault, ...capped, ...one].map((r) => r.n_id)).size).toBe(71)
    expect((await claim()).length).toBe(3)
    expect(await claimOnce()).toEqual([])
  })
})

describe('encerrar só alcança a linha do próprio lote e as inscrições da pessoa da linha', () => {
  let f1: TestUser, f2: TestUser
  let r1: Claimed, r2: Claimed
  beforeAll(async () => {
    await claim()
    f1 = await newUser('Fabi'); f2 = await newUser('Gil')
    for (const u of [f1, f2]) await subscribe(u)
    await subscribe(f1, endpoint('segundo'))
    // Dois lotes diferentes: um para cada pessoa.
    await pendingBill(f1, { name: 'Luz', dueOn: today })
    await morning()
    r1 = (await mine(await claim(), f1))[0]
    await pendingBill(f2, { name: 'Água', dueOn: today })
    await morning()
    r2 = (await mine(await claim(), f2))[0]
  })
  afterAll(async () => { await removeUsers(f1, f2) })

  const open = async (row: Claimed) => expect(await state(row.n_id)).toMatchObject({ sent_at: null, push_sent_at: null, email_sent_at: null, attempts: 1, claim_id: row.n_claim })

  test('lote de outra execução, lote que não existe ou linha que não existe: nada muda', async () => {
    expect(r1.n_claim).not.toBe(r2.n_claim)
    for (const row of [{ n_claim: r2.n_claim, n_id: r1.n_id }, { n_claim: randomUUID(), n_id: r1.n_id }, { n_claim: r1.n_claim, n_id: r2.n_id }, { n_claim: r1.n_claim, n_id: randomUUID() }]) {
      const r = await finish(row, 'sent', 'sent', (await subscriptionsOf(f1.id)).map((x) => x.id))
      expect(r.error).toBeNull()
      expect(r.data).toBe(false)
    }
    await open(r1)
    await open(r2)
    expect((await subscriptionsOf(f1.id)).length).toBe(2)
    expect((await subscriptionsOf(f2.id)).length).toBe(1)
  })

  test('inscrição de outra pessoa na lista: não é apagada', async () => {
    const other = (await subscriptionsOf(f2.id))[0]
    const done = await finish(r1, 'failed', 'none', [other.id, randomUUID()])
    expect(done.data).toBe(true)
    expect((await subscriptionsOf(f2.id)).map((x) => x.id)).toEqual([other.id])
    expect((await subscriptionsOf(f1.id)).length).toBe(2)
    await open(r1) // falhou: continua aberta
  })

  test('listas grandes demais ou resultado desconhecido: recusa igual à de quem não tem o segredo, e nada muda', async () => {
    const mineIds = (await subscriptionsOf(f1.id)).map((x) => x.id)
    const tooMany = [...mineIds, ...Array.from({ length: 9 }, () => randomUUID())]
    const wrongSecret = await finish(r1, 'sent', 'none', [], anon, randomBytes(32).toString('base64url'))
    for (const r of [
      await finish(r1, 'sent', 'none', tooMany),
      await finish(r1, 'ok', 'none'),
      await finish(r1, 'sent', 'talvez'),
      await anon.rpc('job_finish_notification', { p_secret: SECRET, p_claim: r1.n_claim, p_id: r1.n_id, p_push: null, p_email: 'none', p_dead: [] }),
      await anon.rpc('job_finish_notification', { p_secret: SECRET, p_claim: null, p_id: r1.n_id, p_push: 'sent', p_email: 'none', p_dead: [] }),
    ]) {
      expect(r.error?.code).toBe('42501')
      expect(r.error?.message).toBe(wrongSecret.error?.message)
    }
    await open(r1)
    expect((await subscriptionsOf(f1.id)).length).toBe(2)
  })

  test('a própria linha: marca o envio e apaga só a inscrição informada, da pessoa da linha', async () => {
    const [dead, alive] = await subscriptionsOf(f1.id)
    const done = await finish(r1, 'sent', 'none', [dead.id])
    expect(done.data).toBe(true)
    expect((await subscriptionsOf(f1.id)).map((x) => x.id)).toEqual([alive.id])
    expect((await subscriptionsOf(f2.id)).length).toBe(1)
    const after = await state(r1.n_id)
    expect(after.sent_at).not.toBeNull()
    expect(after.push_sent_at).not.toBeNull()
    await open(r2) // a linha do outro lote não foi tocada
  })

  test('encerramento atrasado: depois de uma hora não vale; depois de a linha ser pega de novo, só o lote novo vale', async () => {
    const sub = (await subscriptionsOf(f2.id))[0]
    await age(r2.n_id, 61)
    expect((await finish(r2, 'sent', 'none', [sub.id])).data).toBe(false)
    expect(await state(r2.n_id)).toMatchObject({ sent_at: null, push_sent_at: null, attempts: 1 })
    expect((await subscriptionsOf(f2.id)).length).toBe(1)

    const again = (await mine(await claim(), f2))[0]
    expect(again.n_id).toBe(r2.n_id)
    expect(again.n_claim).not.toBe(r2.n_claim)
    expect((await finish(r2, 'sent', 'none', [sub.id])).data).toBe(false)
    expect((await subscriptionsOf(f2.id)).length).toBe(1)
    expect((await finish(again, 'sent', 'none')).data).toBe(true)
    expect(await state(r2.n_id)).toMatchObject({ attempts: 2, claim_id: again.n_claim })
    expect((await state(r2.n_id)).sent_at).not.toBeNull()
  })
})

describe('o lote só leva o que quem recebe já vê (RN-31, A4 B) e as inscrições de quem recebe', () => {
  let p: TestUser, q: TestUser, x: TestUser, z: TestUser
  let family: string
  let goal: string
  const endpointsOf = async (u: TestUser) => (await subscriptionsOf(u.id)).map((s) => s.endpoint).sort()
  beforeAll(async () => {
    await claim()
    p = await newUser('Paula'); q = await newUser('Quim'); x = await newUser('Xis'); z = await newUser('Zeca')
    family = await createFamily(p, 'Família Colunas')
    for (const u of [q, x, z]) await joinFamily(u, p)
    for (const u of [p, q, x, z]) await subscribe(u)
    await subscribe(q, endpoint('quim-2'))
  })
  afterAll(async () => { await removeUsers(q, x, z, p) })

  test('conta da família paga no cartão, com nota: os outros membros recebem só nome, id, dia e "da família"', async () => {
    const card = await p.client.from('cards').insert({ user_id: p.id, nickname: 'Roxinho secreto', kind: 'credit', color: 'purple' }).select('id').single()
    if (card.error) throw card.error
    const category = await categoryId(p, 'casa')
    const period = monthStart(today)
    const rec = await admin.from('recurrences').insert({
      user_id: p.id, kind: 'expense', name: 'Condomínio', amount_cents: 43210, category_id: category, frequency: 'monthly',
      due_day: Number(today.slice(8)), starts_on: period, generated_through: period, family_id: family, card_id: card.data.id, note: 'nota particular',
    }).select('id').single()
    if (rec.error) throw rec.error
    const tx = await admin.from('transactions').insert({
      user_id: p.id, kind: 'expense', amount_cents: 43210, category_id: category, occurred_on: today, status: 'pending', due_on: today,
      recurrence_id: rec.data.id, recurrence_period: period, family_id: family, card_id: card.data.id, note: 'nota particular',
    }).select('id').single()
    if (tx.error) throw tx.error
    await morning()
    const got = await claim()
    for (const u of [p, q, x, z]) {
      const rows = (await mine(got, u)).filter((r) => r.n_params.id === tx.data.id)
      expect(rows.length, 'uma linha por pessoa').toBe(1)
      expect(Object.keys(rows[0].n_params).sort()).toEqual(['due_on', 'family', 'id', 'name'])
      expect(rows[0].n_params).toEqual({ name: 'Condomínio', id: tx.data.id, due_on: today, family: true })
      // Nada de cartão, nota, valor, categoria, molde nem de quem criou a conta.
      const params = JSON.stringify(rows[0].n_params)
      for (const leak of ['Roxinho', 'nota particular', '43210', 'credit', 'purple']) expect(params, leak).not.toContain(leak)
      const whole = JSON.stringify(rows[0])
      for (const leak of [card.data.id, p.id, category, rec.data.id, 'Roxinho', 'nota particular']) expect(whole, leak).not.toContain(leak)
    }
  })

  test('cada linha leva só as inscrições de quem a recebe, mesmo com várias pessoas no mesmo lote', async () => {
    const bill = await pendingBill(q, { name: 'Internet', dueOn: today, familyId: family })
    await morning()
    const got = (await claim()).filter((r) => r.n_params.id === bill)
    expect(got.length).toBe(4)
    expect(new Set(got.map((r) => r.n_claim)).size).toBe(1) // as quatro pessoas no mesmo lote
    const seen: string[] = []
    for (const u of [p, q, x, z]) {
      const rows = await mine(got, u)
      expect(rows.length).toBe(1)
      const eps = rows[0].n_subscriptions.map((s) => s.endpoint).sort()
      expect(eps).toEqual(await endpointsOf(u))
      expect(rows[0].n_subscriptions.map((s) => s.id).sort()).toEqual((await subscriptionsOf(u.id)).map((s) => s.id).sort())
      expect(rows[0].n_email).toBeNull()
      seen.push(...eps)
    }
    expect(seen.length).toBe(5) // Quim tem dois aparelhos
    expect(new Set(seen).size).toBe(5) // nenhum endereço aparece na linha de outra pessoa
  })

  test('meta da família: o aviso diz só o nome e o total que falta, nunca a parte de cada um; quem saiu antes do envio não recebe', async () => {
    goal = (await p.client.rpc('create_family_goal', { p_name: 'Reforma', p_target_cents: 100000, p_deadline: null })).data as string
    expect((await p.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 31000 })).error).toBeNull()
    expect((await q.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 64000 })).error).toBeNull()
    expect((await p.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(1)
    for (const u of [p, q, x, z]) expect((await logRows(u.id)).filter((r) => r.kind === 'goal_near').length, 'na fila').toBe(1)

    // Xis sai da família (sem parte na meta) antes de a fila ser entregue.
    expect((await x.client.rpc('leave_family')).error).toBeNull()
    const got = await claim()

    for (const u of [p, q, z]) {
      const rows = (await mine(got, u)).filter((r) => r.n_kind === 'goal_near')
      expect(rows.length).toBe(1)
      expect(Object.keys(rows[0].n_params).sort()).toEqual(['id', 'name', 'remaining_cents'])
      expect(rows[0].n_params).toEqual({ name: 'Reforma', id: goal, remaining_cents: 5000 })
      const params = JSON.stringify(rows[0].n_params)
      for (const leak of ['31000', '64000', '95000', 'Paula', 'Quim']) expect(params, leak).not.toContain(leak)
      const whole = JSON.stringify(rows[0])
      for (const leak of [p.id, q.id]) expect(whole, leak).not.toContain(leak)
    }
    // A linha de quem saiu foi encerrada sem envio.
    expect((await mine(got, x)).filter((r) => r.n_kind === 'goal_near')).toEqual([])
    const closed = (await logRows(x.id)).find((r) => r.kind === 'goal_near')!
    expect(closed).toMatchObject({ attempts: 0 })
    expect(closed.sent_at).not.toBeNull()
    // E a saída dela chegou a quem ficou, com a frase que a família já vê; nada para ela.
    for (const u of [p, q, z]) {
      expect((await mine(got, u)).filter((r) => r.n_kind === 'family_event').map((r) => r.n_params))
        .toEqual([{ event_kind: 'member_left', member_name: 'Xis', goal_name: null, amount_cents: null }])
    }
    expect((await logRows(x.id)).filter((r) => r.kind === 'family_event')).toEqual([])
  })

  test('aviso da família na fila de quem sai depois: encerrado sem envio; quem fica recebe o que a tela da família mostra', async () => {
    // Zeca sai: o aviso entra na fila da Paula e do Quim.
    expect((await z.client.rpc('leave_family')).error).toBeNull()
    const queued = (await logRows(q.id)).filter((r) => r.kind === 'family_event' && r.sent_at === null && r.attempts === 0)
    expect(queued.length).toBe(1)
    // Antes da entrega, o Quim também sai (a parte dele na meta volta para ele).
    expect((await q.client.rpc('leave_family')).error).toBeNull()
    const got = await claim()

    expect(await mine(got, q)).toEqual([])
    const closed = (await logRows(q.id)).find((r) => r.id === queued[0].id)!
    expect(closed).toMatchObject({ attempts: 0 })
    expect(closed.sent_at).not.toBeNull()

    const forPaula = (await mine(got, p)).filter((r) => r.n_kind === 'family_event').map((r) => r.n_params)
    expect(forPaula).toHaveLength(2)
    expect(forPaula).toContainEqual({ event_kind: 'member_left', member_name: 'Zeca', goal_name: null, amount_cents: null })
    // RN-22d: a frase da família diz quanto voltou para quem saiu (é o que a tela da família já mostra).
    expect(forPaula).toContainEqual({ event_kind: 'member_left', member_name: 'Quim', goal_name: 'Reforma', amount_cents: 64000 })
    for (const params of forPaula) expect(Object.keys(params).sort()).toEqual(['amount_cents', 'event_kind', 'goal_name', 'member_name'])
  })

  test('meta que deixou de estar perto: o aviso não sai', async () => {
    // Com a saída do Quim, faltam 69000 de 100000. Um aviso "faltam só" forjado agora não é verdade.
    const month = today.slice(0, 7)
    await admin.from('notification_log').delete().eq('user_id', p.id).eq('kind', 'goal_near')
    const forged = await admin.from('notification_log').insert({ user_id: p.id, kind: 'goal_near', ref: `${goal}:${month}` }).select('id').single()
    expect(forged.error).toBeNull()
    expect((await mine(await claim(), p)).filter((r) => r.n_kind === 'goal_near')).toEqual([])
    expect((await state(forged.data!.id)).sent_at).not.toBeNull()
  })
})

describe('avisos da família (decisão 108) por push', () => {
  let x: TestUser, y: TestUser, z: TestUser
  beforeAll(async () => {
    await claim()
    x = await newUser('Xica'); y = await newUser('Yuri'); z = await newUser('Zeca')
    await createFamily(x, 'Família Avisos')
    await joinFamily(y, x)
    await joinFamily(z, x)
    for (const u of [x, y, z]) await subscribe(u)
  })
  afterAll(async () => { await removeUsers(y, x) })

  test('quem sai: os que ficam são avisados com a frase da família; quem saiu, não', async () => {
    expect((await y.client.rpc('leave_family')).error).toBeNull()
    expect((await logRows(y.id)).filter((r) => r.kind === 'family_event')).toEqual([])
    for (const u of [x, z]) expect((await logRows(u.id)).filter((r) => r.kind === 'family_event').length).toBe(1)
    const got = (await mine(await claim(), x)).filter((r) => r.n_kind === 'family_event')
    expect(got.map((r) => r.n_params)).toEqual([{ event_kind: 'member_left', member_name: 'Yuri', goal_name: null, amount_cents: null }])
  })

  test('excluir o cadastro nunca é barrado pelo aviso, e o aviso não leva nome', async () => {
    const del = await admin.auth.admin.deleteUser(z.id)
    expect(del.error).toBeNull()
    expect(await logRows(z.id)).toEqual([])
    const got = (await mine(await claim(), x)).filter((r) => r.n_kind === 'family_event')
    expect(got.map((r) => r.n_params)).toEqual([{ event_kind: 'member_deleted', member_name: null, goal_name: null, amount_cents: null }])
  })
})

describe('agenda e permissões', () => {
  let a: TestUser
  beforeAll(async () => { a = await newUser('Ana') })
  afterAll(async () => { await removeUsers(a) })

  test('nenhuma função da tarefa é chamada por pessoa ou sem sessão', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['job_enqueue_morning', {}], ['job_enqueue_morning_on', { p_today: today }],
      ['job_enqueue_evening', {}], ['job_enqueue_evening_on', { p_today: today }],
      ['job_dispatch', {}], ['job_schedules', {}], ['job_set_paused', { p_paused: true }],
      ['job_generate_occurrences', {}], ['job_cleanup', {}],
      ['job_secret_set', { p_label: 'teste-x', p_hash_hex: null }],
      ['notification_params', { p_user: a.id, p_kind: 'comeback', p_ref: today }],
      // As três com segredo: a pessoa não tem permissão nem com o segredo certo; sem sessão, só com ele.
      ['job_claim_notifications', { p_secret: null, p_limit: 10 }],
      ['job_finish_notification', { p_secret: null, p_claim: randomUUID(), p_id: randomUUID(), p_push: 'sent', p_email: 'none', p_dead: [] }],
      ['job_trigger', { p_secret: null, p_job: 'manha' }],
    ]
    for (const [fn, args] of calls) {
      expect((await a.client.rpc(fn, args)).error?.code, fn).toBe('42501')
      expect((await anon.rpc(fn, args)).error?.code, fn).toBe('42501')
    }
  })

  test('a agenda tem as cinco tarefas nos horários de Brasília (em UTC), pausadas enquanto os testes rodam', async () => {
    const r = await admin.rpc('job_schedules')
    expect(r.error).toBeNull()
    // 00h05 → 5 3; 00h15 → 15 3; 9h → 0 12; 21h → 0 0 (UTC−3, sem horário de verão).
    expect(r.data).toEqual([
      { jobname: 'iris-entrega', schedule: '*/10 * * * *', active: false },
      { jobname: 'iris-limpeza', schedule: '15 3 * * *', active: false },
      { jobname: 'iris-manha', schedule: '0 12 * * *', active: false },
      { jobname: 'iris-noite', schedule: '0 0 * * *', active: false },
      { jobname: 'iris-ocorrencias', schedule: '5 3 * * *', active: false },
    ])
  })

  test('o disparo nunca dá erro: sem endereço e código de disparo no Vault, só não acontece', async () => {
    const r = await admin.rpc('job_dispatch')
    expect(r.error).toBeNull()
    expect(typeof r.data).toBe('boolean')
  })
})
