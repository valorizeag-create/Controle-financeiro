import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, categoryId, newUser, publishable, removeUsers, url, type TestUser } from './helpers'
import { createFamily, joinFamily, todaySP } from './family-helpers'
import { AUTH, P256DH, endpoint, logRows, monthStart, subscribe, subscriptionsOf } from './notify-helpers'

const anon = createClient(url, publishable, { auth: { persistSession: false } })
const today = todaySP()
const month = today.slice(0, 7)

// Colunas da fila: tipo, referência e o estado do envio. Nenhuma guarda texto,
// valor, nome, cartão nem quem provocou o aviso.
const LOG_COLUMNS = [
  'attempts', 'claim_id', 'claimed_at', 'created_at', 'email_sent_at', 'id', 'kind', 'push_sent_at', 'ref', 'sent_at', 'user_id',
]

describe('preferências de aviso (RF-50)', () => {
  let a: TestUser, b: TestUser
  beforeAll(async () => { a = await newUser('Ana'); b = await newUser('Bia') })
  afterAll(async () => { await removeUsers(a, b) })

  test('cada pessoa grava e lê só as próprias', async () => {
    const up = await a.client.from('notification_prefs').upsert({ user_id: a.id, kind: 'daily', enabled: true })
    expect(up.error).toBeNull()
    expect((await a.client.from('notification_prefs').select('kind, enabled')).data).toEqual([{ kind: 'daily', enabled: true }])
    expect((await b.client.from('notification_prefs').select('kind')).data).toEqual([])
    expect((await anon.from('notification_prefs').select('kind')).data ?? []).toEqual([])
  })
  test('ninguém grava a preferência de outra pessoa nem um tipo que não existe', async () => {
    const forOther = await b.client.from('notification_prefs').upsert({ user_id: a.id, kind: 'bills', enabled: false })
    expect(forOther.error).not.toBeNull()
    const change = await b.client.from('notification_prefs').update({ enabled: false }).eq('user_id', a.id).select('kind')
    expect(change.data ?? []).toEqual([])
    const bad = await a.client.from('notification_prefs').upsert({ user_id: a.id, kind: 'tudo', enabled: true })
    expect(bad.error).not.toBeNull()
    expect((await admin.from('notification_prefs').select('kind, enabled').eq('user_id', a.id)).data).toEqual([{ kind: 'daily', enabled: true }])
  })
  test('notification_enabled é interna: ninguém pergunta pela preferência de outra pessoa', async () => {
    const r = await b.client.rpc('notification_enabled', { p_user: a.id, p_kind: 'daily_reminder' })
    expect(r.error?.code).toBe('42501')
    expect((await a.client.rpc('notification_enabled', { p_user: a.id, p_kind: 'daily_reminder' })).error?.code).toBe('42501')
    expect((await anon.rpc('notification_enabled', { p_user: a.id, p_kind: 'daily_reminder' })).error?.code).toBe('42501')
  })
  test('sem linha vale o padrão: tudo ligado, menos o lembrete para anotar (RF-47); a linha gravada manda', async () => {
    const on = (u: TestUser, kind: string) => admin.rpc('notification_enabled', { p_user: u.id, p_kind: kind })
    for (const kind of ['bill_tomorrow', 'bill_today', 'income_today', 'budget_near', 'goal_near', 'month_summary', 'comeback', 'family_event']) {
      expect((await on(b, kind)).data, kind).toBe(true)
    }
    expect((await on(b, 'daily_reminder')).data).toBe(false)
    expect((await on(a, 'daily_reminder')).data).toBe(true) // Ana ligou no primeiro teste
    await b.client.from('notification_prefs').upsert({ user_id: b.id, kind: 'bills', enabled: false })
    expect((await on(b, 'bill_tomorrow')).data).toBe(false)
    expect((await on(b, 'bill_today')).data).toBe(false)
    expect((await on(b, 'income_today')).data).toBe(true)
    expect((await on(a, 'bill_today')).data).toBe(true) // a chave da Bia não muda a da Ana
  })
})

describe('inscrições de push (LGPD)', () => {
  let a: TestUser, b: TestUser, gone: TestUser
  beforeAll(async () => { a = await newUser('Ana'); b = await newUser('Bia'); gone = await newUser('Gil') })
  afterAll(async () => { await removeUsers(a, b) })

  test('a tabela não é lida nem gravada pela API, nem pela própria pessoa', async () => {
    const ep = await subscribe(a)
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).toEqual([ep])
    for (const c of [a.client, b.client, anon]) {
      const read = await c.from('push_subscriptions').select('endpoint')
      expect(read.error?.code).toBe('42501')
      const write = await c.from('push_subscriptions').insert({ user_id: a.id, endpoint: endpoint('x'), p256dh: P256DH, auth: AUTH })
      expect(write.error?.code).toBe('42501')
      const del = await c.from('push_subscriptions').delete().eq('endpoint', ep)
      expect(del.error?.code).toBe('42501')
    }
    expect((await subscriptionsOf(a.id)).length).toBe(1)
  })
  test('sem sessão ninguém se inscreve; endereço e chaves têm forma certa', async () => {
    const noSession = await anon.rpc('save_push_subscription', { p_endpoint: endpoint('n'), p_p256dh: P256DH, p_auth: AUTH })
    expect(noSession.error).not.toBeNull()
    for (const bad of ['http://fcm.googleapis.com/fcm/send/abcdefgh', 'ftp://exemplo.com/abcdefghij', 'https://a b.exemplo.com/abcdef', '', `https://x/${'a'.repeat(2100)}`]) {
      const r = await b.client.rpc('save_push_subscription', { p_endpoint: bad, p_p256dh: P256DH, p_auth: AUTH })
      expect(r.error?.message, bad).toContain('Inscrição inválida.')
    }
    const badKey = await b.client.rpc('save_push_subscription', { p_endpoint: endpoint('k'), p_p256dh: 'curta', p_auth: AUTH })
    expect(badKey.error?.message).toContain('Inscrição inválida.')
    const badAuth = await b.client.rpc('save_push_subscription', { p_endpoint: endpoint('k'), p_p256dh: P256DH, p_auth: 'a b' })
    expect(badAuth.error?.message).toContain('Inscrição inválida.')
    expect(await subscriptionsOf(b.id)).toEqual([])
  })
  // Review Focus 3 e M1 da revisão de segurança: o banco só guarda endereço
  // dos serviços de push conhecidos (a mesma lista de isAllowedPushEndpoint).
  test('só os serviços de push conhecidos: endereço interno ou de outro domínio é recusado ao salvar', async () => {
    const tail = `abcdefgh-${Date.now()}`
    for (const bad of [
      'https://169.254.169.254/latest/meta-data', `https://localhost/${tail}`, `https://127.0.0.1:54321/rest/v1/${tail}`,
      `https://exemplo.com/${tail}`, `https://fcm.googleapis.com.evil.dev/${tail}`, `https://evil.dev/fcm.googleapis.com/${tail}`,
      `https://user:pass@fcm.googleapis.com/${tail}`, `https://fcm.googleapis.com:8443/${tail}`,
      `https://notify.windows.com.evil.dev/${tail}`, `https://push.apple.com/${tail}`, `https://FCM.googleapis.com/${tail}`,
    ]) {
      const r = await b.client.rpc('save_push_subscription', { p_endpoint: bad, p_p256dh: P256DH, p_auth: AUTH })
      expect(r.error?.message, bad).toContain('Inscrição inválida.')
      // a regra também está na tabela: nem uma gravação fora da função guarda esse endereço
      const direct = await admin.from('push_subscriptions').insert({ user_id: b.id, endpoint: bad, p256dh: P256DH, auth: AUTH })
      expect(direct.error?.code, bad).toBe('23514')
    }
    expect(await subscriptionsOf(b.id)).toEqual([])
    const good = [
      `https://updates.push.services.mozilla.com/wpush/v2/${tail}`, `https://wns2-by3p.notify.windows.com/w/?token=${tail}`,
      `https://web.push.apple.com/${tail}`,
    ]
    for (const ep of good) await subscribe(b, ep)
    expect((await subscriptionsOf(b.id)).map((s) => s.endpoint)).toEqual(good)
    for (const ep of good) await b.client.rpc('delete_push_subscription', { p_endpoint: ep })
    expect(await subscriptionsOf(b.id)).toEqual([])
  })
  test('a mesma inscrição passa para quem ativou por último (aparelho compartilhado)', async () => {
    const ep = await subscribe(a, endpoint('shared'))
    await subscribe(b, ep)
    expect((await subscriptionsOf(b.id)).map((s) => s.endpoint)).toContain(ep)
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).not.toContain(ep)
    // um aparelho = uma pessoa: o endereço nunca fica em duas linhas
    expect((await admin.from('push_subscriptions').select('user_id').eq('endpoint', ep)).data).toEqual([{ user_id: b.id }])
  })
  test('o mesmo endereço em chamadas ao mesmo tempo (dois toques, duas abas): nenhuma falha, uma linha só', async () => {
    const ep = endpoint('junto')
    for (let round = 0; round < 5; round++) {
      const results = await Promise.all([1, 2, 3].map(() =>
        a.client.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: P256DH, p_auth: AUTH })))
      for (const r of results) expect(r.error).toBeNull()
      expect((await admin.from('push_subscriptions').select('user_id').eq('endpoint', ep)).data).toEqual([{ user_id: a.id }])
    }
  })
  test('duas pessoas ativando o mesmo endereço ao mesmo tempo: nenhuma falha; a linha é de uma só, com as chaves dela', async () => {
    const ep = endpoint('disputa')
    const keyA = `B${'A'.repeat(86)}`
    const keyB = `B${'C'.repeat(86)}`
    for (let round = 0; round < 5; round++) {
      const [ra, rb] = await Promise.all([
        a.client.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: keyA, p_auth: AUTH }),
        b.client.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: keyB, p_auth: AUTH }),
      ])
      expect(ra.error).toBeNull()
      expect(rb.error).toBeNull()
      const rows = (await admin.from('push_subscriptions').select('user_id, p256dh').eq('endpoint', ep)).data ?? []
      // um aparelho = uma pessoa: nunca duas linhas, nunca a chave de uma na linha da outra
      expect(rows.length).toBe(1)
      expect([{ user_id: a.id, p256dh: keyA }, { user_id: b.id, p256dh: keyB }]).toContainEqual(rows[0])
    }
    // Depois da disputa, quem ativa sozinha por último fica com o endereço.
    await subscribe(b, ep)
    expect((await admin.from('push_subscriptions').select('user_id').eq('endpoint', ep)).data).toEqual([{ user_id: b.id }])
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).not.toContain(ep)
    await b.client.rpc('delete_push_subscription', { p_endpoint: ep })
  })
  test('quem abre o app num aparelho com a inscrição de outra pessoa: ela é apagada e a resposta é "não é sua"', async () => {
    const ep = await subscribe(a, endpoint('sync'))
    expect((await a.client.rpc('sync_push_subscription', { p_endpoint: ep })).data).toBe(true)
    expect((await b.client.rpc('sync_push_subscription', { p_endpoint: ep })).data).toBe(false)
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).not.toContain(ep)
    expect((await b.client.rpc('sync_push_subscription', { p_endpoint: endpoint('nunca') })).data).toBe(false)
    expect((await anon.rpc('sync_push_subscription', { p_endpoint: ep })).error).not.toBeNull()
  })
  test('desativar apaga só a própria inscrição', async () => {
    const ep = await subscribe(a, endpoint('del'))
    await b.client.rpc('delete_push_subscription', { p_endpoint: ep })
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).toContain(ep)
    expect((await anon.rpc('delete_push_subscription', { p_endpoint: ep })).error).not.toBeNull()
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).toContain(ep)
    await a.client.rpc('delete_push_subscription', { p_endpoint: ep })
    expect((await subscriptionsOf(a.id)).map((s) => s.endpoint)).not.toContain(ep)
  })
  test('no máximo 10 aparelhos por pessoa: o mais antigo sai', async () => {
    const before = (await subscriptionsOf(b.id)).map((s) => s.endpoint)
    const eps: string[] = []
    for (let i = 0; i < 11; i++) eps.push(await subscribe(b, endpoint(`d${i}`)))
    const kept = (await subscriptionsOf(b.id)).map((s) => s.endpoint)
    expect(kept.length).toBe(10)
    for (const old of before) expect(kept).not.toContain(old)
    expect(kept).not.toContain(eps[0])
    expect(kept).toContain(eps[10])
  })
  test('excluir o cadastro apaga inscrições, preferências e avisos da pessoa', async () => {
    await subscribe(gone)
    await gone.client.from('notification_prefs').upsert({ user_id: gone.id, kind: 'daily', enabled: true })
    const { error } = await admin.from('notification_log').insert({ user_id: gone.id, kind: 'comeback', ref: today })
    expect(error).toBeNull()
    await removeUsers(gone)
    expect(await subscriptionsOf(gone.id)).toEqual([])
    expect(await logRows(gone.id)).toEqual([])
    expect((await admin.from('notification_prefs').select('kind').eq('user_id', gone.id)).data).toEqual([])
  })
})

describe('fila de avisos', () => {
  let a: TestUser, b: TestUser, c: TestUser, out: TestUser
  beforeAll(async () => {
    a = await newUser('Ana'); b = await newUser('Bia'); c = await newUser('Caio'); out = await newUser('Eli')
    await createFamily(a, 'Família Fila')
    await joinFamily(b, a)
    await joinFamily(c, a)
    await subscribe(a); await subscribe(b); await subscribe(out)
  })
  afterAll(async () => { await removeUsers(b, c, out, a) })

  test('a fila não é lida nem gravada pela API', async () => {
    await admin.from('notification_log').insert({ user_id: a.id, kind: 'comeback', ref: 'x' })
    for (const cl of [a.client, b.client, anon]) {
      expect((await cl.from('notification_log').select('id')).error?.code).toBe('42501')
      expect((await cl.from('notification_log').insert({ user_id: a.id, kind: 'comeback', ref: 'y' })).error?.code).toBe('42501')
    }
  })

  test('planejado: só categoria própria, com planejado neste mês, uma vez por mês, com aparelho e com a chave ligada', async () => {
    const mine = await categoryId(a, 'mercado')
    const others = await categoryId(b, 'mercado')
    const q = (u: TestUser, id: string) => u.client.rpc('queue_own_notification', { p_kind: 'budget_near', p_id: id })
    expect((await q(a, others)).data).toBe(0)
    expect((await q(a, mine)).data).toBe(0) // sem planejado
    const { error } = await admin.from('budgets').insert({ user_id: a.id, month: monthStart(today), category_id: mine, amount_cents: 100000 })
    expect(error).toBeNull()
    expect((await q(a, mine)).data).toBe(1)
    expect((await q(a, mine)).data).toBe(0) // já avisado neste mês
    expect((await logRows(a.id)).filter((r) => r.kind === 'budget_near').map((r) => r.ref)).toEqual([`${mine}:${month}`])

    const cCat = await categoryId(c, 'mercado')
    await admin.from('budgets').insert({ user_id: c.id, month: monthStart(today), category_id: cCat, amount_cents: 100000 })
    expect((await q(c, cCat)).data).toBe(0) // sem aparelho
    const bCat = await categoryId(b, 'lazer')
    await admin.from('budgets').insert({ user_id: b.id, month: monthStart(today), category_id: bCat, amount_cents: 100000 })
    await b.client.from('notification_prefs').upsert({ user_id: b.id, kind: 'budget', enabled: false })
    expect((await q(b, bCat)).data).toBe(0) // chave desligada
    for (const u of [b, c]) expect((await logRows(u.id)).some((r) => r.kind === 'budget_near')).toBe(false)
  })

  test('meta pessoal: só quando falta até um décimo, nunca completa, nunca a meta de outra pessoa', async () => {
    const goal = (await out.client.from('goals').insert({ user_id: out.id, name: 'Viagem', target_cents: 100000 }).select('id').single()).data!.id
    const q = (u: TestUser) => u.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })
    await out.client.rpc('deposit_to_goal', { p_goal_id: goal, p_amount_cents: 50000 })
    expect((await q(out)).data).toBe(0)
    await out.client.rpc('deposit_to_goal', { p_goal_id: goal, p_amount_cents: 40000 })
    expect((await q(a)).data).toBe(0) // não é dela
    expect((await q(out)).data).toBe(1)
    expect((await q(out)).data).toBe(0)
    expect((await logRows(out.id)).filter((r) => r.kind === 'goal_near').map((r) => r.ref)).toEqual([`${goal}:${month}`])
    expect((await logRows(a.id)).some((r) => r.kind === 'goal_near')).toBe(false)
    const done = (await out.client.from('goals').insert({ user_id: out.id, name: 'Pronta', target_cents: 1000 }).select('id').single()).data!.id
    await out.client.rpc('deposit_to_goal', { p_goal_id: done, p_amount_cents: 1000 })
    expect((await out.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: done })).data).toBe(0)
  })

  test('meta da família: avisa quem participa e tem aparelho; quem é de fora não enfileira nada', async () => {
    const goal = (await a.client.rpc('create_family_goal', { p_name: 'Sofá', p_target_cents: 100000, p_deadline: null })).data as string
    await b.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 95000 })
    expect((await out.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(0)
    // Ana e Bia entram na fila; Caio não tem aparelho. A resposta diz só se o
    // aviso de quem chamou entrou (M2 da revisão): nunca quantas pessoas da
    // família têm aparelho ou a chave ligada.
    expect((await b.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(1)
    for (const u of [a, b]) expect((await logRows(u.id)).some((r) => r.kind === 'goal_near' && r.ref === `${goal}:${month}`)).toBe(true)
    expect((await logRows(c.id)).some((r) => r.kind === 'goal_near')).toBe(false)
    expect((await logRows(out.id)).some((r) => r.ref.startsWith(goal))).toBe(false)
  })

  test('meta da família: quem não tem aparelho recebe 0 mesmo quando os outros entram na fila', async () => {
    const goal = (await a.client.rpc('create_family_goal', { p_name: 'Geladeira', p_target_cents: 100000, p_deadline: null })).data as string
    await a.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 91000 })
    expect((await c.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(0)
    for (const u of [a, b]) expect((await logRows(u.id)).some((r) => r.kind === 'goal_near' && r.ref === `${goal}:${month}`)).toBe(true)
    expect((await logRows(c.id)).some((r) => r.kind === 'goal_near')).toBe(false)
    expect((await a.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(0) // já está na fila
  })

  test('tipo desconhecido, id vazio e falta de sessão são recusados', async () => {
    const mine = await categoryId(a, 'mercado')
    expect((await a.client.rpc('queue_own_notification', { p_kind: 'bill_today', p_id: mine })).error?.message).toContain('Aviso inválido.')
    expect((await a.client.rpc('queue_own_notification', { p_kind: 'budget_near', p_id: null })).error?.message).toContain('Aviso inválido.')
    expect((await anon.rpc('queue_own_notification', { p_kind: 'budget_near', p_id: mine })).error).not.toBeNull()
  })
})

// I5 da revisão de segurança: a "outra pessoa" dos testes acima nunca era da
// mesma família. Aqui: quem administra, um membro e quem já saiu.
describe('dentro da família cada pessoa só alcança o que é seu', () => {
  let adm: TestUser, mem: TestUser, ex: TestUser
  const eps = new Map<string, string>()
  beforeAll(async () => {
    adm = await newUser('Ana'); mem = await newUser('Bia'); ex = await newUser('Edu')
    await createFamily(adm, 'Família Isolada')
    await joinFamily(mem, adm)
    await joinFamily(ex, adm)
    const left = await ex.client.rpc('leave_family')
    if (left.error) throw left.error
    for (const u of [adm, mem, ex]) {
      eps.set(u.id, await subscribe(u))
      const pref = await u.client.from('notification_prefs').upsert({ user_id: u.id, kind: 'summary', enabled: false })
      if (pref.error) throw pref.error
      const log = await admin.from('notification_log').insert({ user_id: u.id, kind: 'comeback', ref: today })
      if (log.error) throw log.error
    }
  })
  afterAll(async () => { await removeUsers(mem, ex, adm) })

  const others = (u: TestUser) => [adm, mem, ex].filter((o) => o.id !== u.id)

  test('preferências: nem quem administra, nem outro membro, nem quem saiu lê ou muda as de outra pessoa', async () => {
    for (const u of [adm, mem, ex]) {
      expect((await u.client.from('notification_prefs').select('user_id, kind, enabled')).data)
        .toEqual([{ user_id: u.id, kind: 'summary', enabled: false }])
      for (const o of others(u)) {
        expect((await u.client.from('notification_prefs').select('kind').eq('user_id', o.id)).data).toEqual([])
        const change = await u.client.from('notification_prefs').update({ enabled: true }).eq('user_id', o.id).select('kind')
        expect(change.data ?? []).toEqual([])
        expect((await u.client.from('notification_prefs').upsert({ user_id: o.id, kind: 'summary', enabled: true })).error).not.toBeNull()
        expect((await u.client.from('notification_prefs').insert({ user_id: o.id, kind: 'bills', enabled: false })).error).not.toBeNull()
        expect((await u.client.from('notification_prefs').delete().eq('user_id', o.id)).error?.code).toBe('42501')
      }
    }
    for (const u of [adm, mem, ex]) {
      expect((await admin.from('notification_prefs').select('kind, enabled').eq('user_id', u.id)).data).toEqual([{ kind: 'summary', enabled: false }])
    }
  })

  test('inscrições e fila: nenhuma leitura ou gravação direta; cada linha continua só da pessoa', async () => {
    for (const u of [adm, mem, ex]) {
      for (const table of ['push_subscriptions', 'notification_log']) {
        expect((await u.client.from(table).select('id')).error?.code, table).toBe('42501')
        expect((await u.client.from(table).update({ user_id: u.id }).neq('user_id', u.id)).error?.code, table).toBe('42501')
        expect((await u.client.from(table).delete().neq('user_id', u.id)).error?.code, table).toBe('42501')
      }
      for (const o of others(u)) {
        const ins = await u.client.from('push_subscriptions').insert({ user_id: o.id, endpoint: endpoint('fam'), p256dh: P256DH, auth: AUTH })
        expect(ins.error?.code).toBe('42501')
        const log = await u.client.from('notification_log').insert({ user_id: o.id, kind: 'family_event', ref: 'forjado' })
        expect(log.error?.code).toBe('42501')
        // desativar com o endereço de outra pessoa não apaga nada
        expect((await u.client.rpc('delete_push_subscription', { p_endpoint: eps.get(o.id)! })).error).toBeNull()
      }
    }
    for (const u of [adm, mem, ex]) {
      expect((await subscriptionsOf(u.id)).map((s) => s.endpoint)).toEqual([eps.get(u.id)])
      expect((await admin.from('push_subscriptions').select('user_id').eq('endpoint', eps.get(u.id)!)).data).toEqual([{ user_id: u.id }])
      expect((await logRows(u.id)).map((r) => [r.kind, r.ref])).toEqual([['comeback', today]])
    }
  })

  test('meta da família: quem saiu não enfileira nem recebe; a linha de outro membro guarda só tipo e referência (A4 B, RN-31)', async () => {
    const goal = (await adm.client.rpc('create_family_goal', { p_name: 'Reforma', p_target_cents: 100000, p_deadline: null })).data as string
    expect((await adm.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 30000 })).error).toBeNull()
    expect((await mem.client.rpc('deposit_family_goal', { p_goal_id: goal, p_amount_cents: 65000 })).error).toBeNull()
    const near = async (u: TestUser) => (await logRows(u.id)).filter((r) => r.kind === 'goal_near')

    // Quem saiu (e ainda tem aparelho e a chave ligada) não provoca aviso na família.
    expect((await ex.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(0)
    for (const u of [adm, mem, ex]) expect(await near(u)).toEqual([])

    expect((await mem.client.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goal })).data).toBe(1)
    expect((await near(mem)).map((r) => r.ref)).toEqual([`${goal}:${month}`])
    expect(await near(ex)).toEqual([]) // quem saiu não recebe

    // O que ficou na fila para a Ana (outro membro): só tipo e referência.
    // Nada de valor, nome da meta, quem guardou nem a parte de cada um.
    const { data, error } = await admin.from('notification_log').select('*').eq('user_id', adm.id).eq('kind', 'goal_near')
    expect(error).toBeNull()
    expect(data!.length).toBe(1)
    const row = data![0] as Record<string, unknown>
    expect(Object.keys(row).sort()).toEqual(LOG_COLUMNS)
    expect(row.ref).toBe(`${goal}:${month}`)
    expect(row.user_id).toBe(adm.id)
    expect([row.claim_id, row.claimed_at, row.sent_at, row.push_sent_at, row.email_sent_at]).toEqual([null, null, null, null, null])
    expect(row.attempts).toBe(0)
    const text = JSON.stringify(row)
    for (const leak of [mem.id, ex.id, 'Reforma']) expect(text, leak).not.toContain(leak)
  })

  test('excluir o cadastro de um membro apaga só o que é dele', async () => {
    const del = await newUser('Davi')
    try {
      await joinFamily(del, adm)
      await subscribe(del)
      await del.client.from('notification_prefs').upsert({ user_id: del.id, kind: 'family', enabled: false })
      const queued = await admin.from('notification_log').insert([
        { user_id: del.id, kind: 'family_event', ref: 'aviso-1' },
        { user_id: del.id, kind: 'month_summary', ref: month },
      ])
      expect(queued.error).toBeNull()
      expect((await subscriptionsOf(del.id)).length).toBe(1)
      expect((await logRows(del.id)).length).toBe(2)
    } finally {
      await removeUsers(del)
    }
    expect(await subscriptionsOf(del.id)).toEqual([])
    expect(await logRows(del.id)).toEqual([])
    expect((await admin.from('notification_prefs').select('kind').eq('user_id', del.id)).data).toEqual([])
    for (const u of [adm, mem, ex]) {
      expect((await subscriptionsOf(u.id)).map((s) => s.endpoint)).toEqual([eps.get(u.id)])
      expect((await logRows(u.id)).length).toBeGreaterThan(0)
      expect((await admin.from('notification_prefs').select('kind').eq('user_id', u.id)).data).toEqual([{ kind: 'summary' }])
    }
  })
})
