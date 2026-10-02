import { createHash, createHmac } from 'node:crypto'
import { expect, test, type BrowserContextOptions, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { monthOf, todayInSaoPaulo } from '../../src/domain/dates'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})
const password = 'senha-forte-123'
const created: string[] = []
// Prefixo único por worker e por execução: a limpeza de um worker nunca apaga usuários do outro.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const WORKER = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0'
const RUN_PREFIX = `e2e-p8-w${WORKER}-${RUN_ID}-`
const today = todayInSaoPaulo()
const current = monthOf(today)
const OFFLINE = 'Sem conexão no momento. Assim que voltar, a gente tenta de novo.'
const INSTALL = 'Adicione a Íris à sua tela de início para abrir com um toque e receber lembretes.'
const INVITE_SUBJECT = 'Você recebeu um convite na Íris'
const P256DH = `B${'A'.repeat(86)}`
const AUTH = 'A'.repeat(22)
const JOB = '/api/jobs/notificacoes'
const TRIGGER_HEADER = 'x-iris-job-trigger'
// Nome do segredo da tarefa só para esta execução (no máximo 5 no banco): o teste registra o resumo
// (SHA-256) do JOB_SECRET do .env.local e o remove no fim. O segredo em si nunca vai ao banco nem ao disco.
const JOB_LABEL = 'e2e-p8'
let jobLabelRegistered = false

const triggerToken = (secret: string) => createHmac('sha256', secret).update('iris-job-trigger-v1').digest('base64url')

async function makeUser(name: string, opts: { onboarded?: boolean } = {}): Promise<{ id: string; email: string }> {
  const email = `${RUN_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
  if (error) throw error
  created.push(data.user.id)
  if (opts.onboarded !== false) {
    const { error: e2 } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', data.user.id)
    if (e2) throw e2
  }
  return { id: data.user.id, email }
}

async function category(userId: string, key: string): Promise<string> {
  const { data, error } = await admin.from('categories').select('id').eq('user_id', userId).eq('default_key', key).single()
  if (error) throw error
  return data.id
}

async function seedExpense(userId: string, key: string, cents: number, note: string): Promise<void> {
  const { error } = await admin.from('transactions').insert({
    user_id: userId, kind: 'expense', amount_cents: cents, category_id: await category(userId, key), occurred_on: today, note,
  })
  if (error) throw error
}

// Conta que vence hoje: o molde começa no dia 1 e a geração do banco cria a ocorrência; devolve o id da conta a pagar.
async function seedBillDueToday(userId: string, name: string): Promise<string> {
  const rec = await admin.from('recurrences').insert({
    user_id: userId, kind: 'expense', name, amount_cents: 18000, category_id: await category(userId, 'casa'),
    frequency: 'monthly', due_day: Number(today.slice(8)), starts_on: `${current}-01`,
  }).select('id').single()
  if (rec.error) throw rec.error
  const gen = await admin.rpc('generate_occurrences_for', { p_user: userId })
  if (gen.error) throw gen.error
  const tx = await admin.from('transactions').select('id').eq('recurrence_id', rec.data.id).eq('status', 'pending').single()
  if (tx.error) throw tx.error
  return tx.data.id as string
}

async function seedFamily(adminId: string, name: string): Promise<void> {
  const { data: fam, error } = await admin.from('families').insert({ name, created_by: adminId }).select('id').single()
  if (error) throw error
  const { data: profile, error: e1 } = await admin.from('profiles').select('display_name').eq('id', adminId).single()
  if (e1) throw e1
  const { error: e2 } = await admin.from('family_members').insert({ family_id: fam.id, user_id: adminId, role: 'admin', display_name: profile.display_name })
  if (e2) throw e2
}

async function entrar(page: Page, email: string, landing: RegExp = /\/inicio/, from = '/entrar'): Promise<void> {
  await page.goto(from)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(landing)
}

const statusOf = async (id: string) => (await admin.from('transactions').select('status').eq('id', id).single()).data?.status
const subscriptions = async (userId: string) => (await admin.from('push_subscriptions').select('endpoint').eq('user_id', userId)).data

test.afterAll(async () => {
  const remove = async (id: string) => {
    const first = await admin.auth.admin.deleteUser(id)
    if (first.error) {
      const second = await admin.auth.admin.deleteUser(id)
      if (second.error) throw second.error
    }
  }
  for (const id of created) await remove(id)
  const known = new Set(created)
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      if (u.email?.startsWith(RUN_PREFIX) && !known.has(u.id)) await remove(u.id)
    }
    if (data.users.length < 1000) break
    page += 1
  }
  if (jobLabelRegistered) {
    const { error } = await admin.rpc('job_secret_set', { p_label: JOB_LABEL, p_hash_hex: null })
    if (error) throw error
  }
})

test('celular: manifest, service worker e página "Sem conexão" são públicos e válidos; nada de "baixe"', async ({ request }, info) => {
  test.skip(info.project.name !== 'celular')
  const manifest = await request.get('/manifest.webmanifest', { maxRedirects: 0 })
  expect(manifest.status()).toBe(200)
  const m = await manifest.json()
  expect(m).toMatchObject({
    name: 'Íris', short_name: 'Íris', start_url: '/inicio', scope: '/', display: 'standalone', theme_color: '#f8f8f8', background_color: '#f8f8f8',
  })
  expect(m.icons.map((i: { purpose: string }) => i.purpose).sort()).toEqual(['any', 'any', 'maskable', 'maskable'])
  for (const icon of m.icons as { src: string }[]) {
    const r = await request.get(icon.src, { maxRedirects: 0 })
    expect(r.status(), icon.src).toBe(200)
    expect(r.headers()['content-type']).toBe('image/png')
  }
  const sw = await request.get('/sw.js', { maxRedirects: 0 })
  expect(sw.status()).toBe(200)
  expect(sw.headers()['content-type']).toContain('javascript')
  expect(sw.headers()['cache-control']).toContain('no-cache')
  const offline = await request.get('/sem-conexao.html', { maxRedirects: 0 })
  expect(offline.status()).toBe(200)
  const offlineText = await offline.text()
  expect(offlineText).toContain(OFFLINE)
  expect(offlineText).toContain('Tentar de novo')
  for (const body of [JSON.stringify(m), offlineText, await sw.text()]) expect(body.toLowerCase()).not.toMatch(/baix/)
})

test('celular: sem rede aparece "Sem conexão"; o service worker não guarda nenhuma tela do app', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await seedExpense(u.id, 'mercado', 14230, 'feira')
  await entrar(page, u.email)
  // Em desenvolvimento o service worker só registra com NEXT_PUBLIC_REGISTER_SW=1 (a configuração do Playwright liga).
  // Se um servidor já estava rodando sem isso, reinicie o servidor.
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) !== undefined)).toBe(true)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
  await page.goto('/extrato')
  await expect(page.getByText('feira')).toBeVisible()

  const cached = await page.evaluate(async () => {
    const out: string[] = []
    for (const key of await caches.keys()) {
      for (const req of await (await caches.open(key)).keys()) out.push(new URL(req.url).pathname)
    }
    return out.sort()
  })
  expect(cached).toEqual(['/icons/icon-192.png', '/sem-conexao.html'])

  await context.setOffline(true)
  // Na tela já aberta: o aviso; o que estava na tela continua lá.
  await expect(page.getByRole('status').filter({ hasText: OFFLINE })).toBeVisible()
  // Ao navegar sem rede: a página estática, sem nenhum dado.
  await page.goto('/extrato').catch(() => {})
  await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible()
  await expect(page.getByText(OFFLINE)).toBeVisible()
  await expect(page.getByText('feira')).toHaveCount(0)

  await context.setOffline(false)
  await page.getByRole('link', { name: 'Tentar de novo', exact: true }).click()
  await expect(page).toHaveURL(/\/inicio/)
  await expect(page.getByRole('status').filter({ hasText: OFFLINE })).toHaveCount(0)
})

test('celular: depois do saldo inicial vem "Instalar a Íris"; "Agora não" segue para o primeiro gasto; Configurações tem o mesmo convite', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Eva', { onboarded: false })
  await entrar(page, u.email, /\/boas-vindas$/)
  await page.getByRole('link', { name: 'Pular', exact: true }).click()
  await page.getByRole('button', { name: 'Pular', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Instalar a Íris' })).toBeVisible()
  await expect(page.getByText(INSTALL)).toBeVisible()
  expect((await page.locator('body').innerText()).toLowerCase()).not.toMatch(/baix|loja/)
  await page.getByRole('link', { name: 'Agora não', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Que tal anotar seu primeiro gasto?' })).toBeVisible()
  // Termina o onboarding (qualquer outra tela do app leva de volta a ele até lá).
  await page.getByRole('link', { name: 'Depois', exact: true }).click()
  await expect(page).toHaveURL(/\/inicio$/)

  await page.goto('/configuracoes')
  await page.getByRole('link', { name: 'Adicionar à tela de início', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Instalar a Íris' })).toBeVisible()
  await expect(page.getByText(INSTALL)).toBeVisible()
})

test('celular: Lembretes — cada tipo liga e desliga e a escolha fica gravada; "Avisos da família" só para quem tem família', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'celular')
  const solo = await makeUser('Camila')
  await entrar(page, solo.email)
  await page.goto('/configuracoes')
  await expect(page.getByRole('heading', { level: 2, name: 'Lembretes' })).toBeVisible()
  await expect(page.getByText('Lembretes neste aparelho', { exact: true })).toBeVisible()

  const daily = () => page.getByRole('switch', { name: 'Lembrete para anotar', exact: true })
  const bills = () => page.getByRole('switch', { name: 'Contas perto do vencimento', exact: true })
  // Padrões: tudo ligado, menos o lembrete para anotar (RF-47).
  await expect(daily()).toHaveAttribute('aria-checked', 'false')
  await expect(bills()).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Todo dia às 21h', { exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Avisos da família', exact: true })).toHaveCount(0)
  await daily().click()
  await expect(daily()).toHaveAttribute('aria-checked', 'true')
  await bills().click()
  await expect(bills()).toHaveAttribute('aria-checked', 'false')
  await page.reload()
  await expect(daily()).toHaveAttribute('aria-checked', 'true')
  await expect(bills()).toHaveAttribute('aria-checked', 'false')
  const prefs = await admin.from('notification_prefs').select('kind, enabled').eq('user_id', solo.id).order('kind')
  expect(prefs.data).toEqual([{ kind: 'bills', enabled: false }, { kind: 'daily', enabled: true }])
  // Religar volta ao padrão.
  await bills().click()
  await expect(bills()).toHaveAttribute('aria-checked', 'true')

  const withFamily = await makeUser('Alex')
  await seedFamily(withFamily.id, 'Família Souza')
  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const familyPage = await other.newPage()
  await entrar(familyPage, withFamily.email)
  await familyPage.goto('/configuracoes')
  await expect(familyPage.getByRole('switch', { name: 'Avisos da família', exact: true })).toHaveAttribute('aria-checked', 'true')
  await other.close()
})

test('celular: ativar lembretes neste aparelho grava a inscrição; desativar e sair da Íris a apagam', async ({ browser }, info) => {
  test.skip(info.project.name !== 'celular')
  test.skip(!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, 'defina as chaves VAPID locais em .env.local (README)')
  const u = await makeUser('Camila')
  const endpoint = `https://fcm.googleapis.com/fcm/send/${RUN_PREFIX}aparelho`
  const context = await browser.newContext({ ...(info.project.use as BrowserContextOptions), permissions: ['notifications'] })
  // O navegador de teste não fala com um serviço de push de verdade: só a inscrição do navegador é simulada.
  // A tela, a ação do servidor e o banco são os reais.
  await context.addInitScript(({ endpoint, p256dh, auth }) => {
    const FLAG = 'e2e-push'
    const sub = {
      endpoint, expirationTime: null,
      toJSON: () => ({ endpoint, keys: { p256dh, auth } }),
      unsubscribe: async () => { localStorage.removeItem(FLAG); return true },
    }
    PushManager.prototype.subscribe = async () => { localStorage.setItem(FLAG, '1'); return sub as unknown as PushSubscription }
    PushManager.prototype.getSubscription = async () => (localStorage.getItem(FLAG) ? (sub as unknown as PushSubscription) : null)
  }, { endpoint, p256dh: P256DH, auth: AUTH })
  const page = await context.newPage()
  await entrar(page, u.email)
  await page.goto('/configuracoes')
  await expect(page.getByRole('heading', { level: 2, name: 'Lembretes' })).toBeVisible()

  // Sem inscrição: o botão de ativar; a permissão só é pedida ao tocar.
  await expect(page.getByRole('button', { name: 'Ativar lembretes', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Desativar neste aparelho', exact: true })).toHaveCount(0)
  expect(await subscriptions(u.id)).toEqual([])
  await page.getByRole('button', { name: 'Ativar lembretes', exact: true }).click()
  await expect(page.getByText('Lembretes ativados.')).toBeVisible()
  await expect.poll(() => subscriptions(u.id)).toEqual([{ endpoint }])
  await page.reload()
  await expect(page.getByText('Os lembretes estão ativos neste aparelho.')).toBeVisible()
  await page.getByRole('button', { name: 'Desativar neste aparelho', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ativar lembretes', exact: true })).toBeVisible()
  await expect.poll(() => subscriptions(u.id)).toEqual([])

  // Sair da Íris desativa os lembretes neste aparelho (aparelho compartilhado).
  await page.getByRole('button', { name: 'Ativar lembretes', exact: true }).click()
  await expect.poll(() => subscriptions(u.id)).toEqual([{ endpoint }])
  await page.goto('/mais')
  await page.getByRole('button', { name: 'Sair da Íris', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sair', exact: true }).click()
  await expect(page).toHaveURL(/\/entrar/)
  await expect.poll(() => subscriptions(u.id)).toEqual([])
  await context.close()
})

test('desktop: o destino do aviso abre Contas na confirmação; nada é pago sem confirmar; a conta de outra pessoa não abre nada', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const camila = await makeUser('Camila')
  const alex = await makeUser('Alex')
  const mine = await seedBillDueToday(camila.id, 'Luz')
  const theirs = await seedBillDueToday(alex.id, 'Aluguel')
  await entrar(page, camila.email)

  await page.goto(`/contas?mes=${current}&pagar=${theirs}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Contas' })).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByText('Aluguel')).toHaveCount(0)

  await page.goto(`/contas?mes=${current}&pagar=${mine}`)
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Marcar Luz como paga?')
  await dialog.getByRole('button', { name: 'Agora não', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(await statusOf(mine)).toBe('pending')

  await page.goto(`/contas?mes=${current}&pagar=${mine}`)
  await page.getByRole('alertdialog').getByRole('button', { name: 'Marcar como paga', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Conta marcada como paga.' })).toBeVisible()
  expect(await statusOf(mine)).toBe('confirmed')
  expect(await statusOf(theirs)).toBe('pending')
})

test('desktop: sem entrar, o destino do aviso leva a entrar e volta à confirmação; endereço de retorno estranho não vale', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop')
  const camila = await makeUser('Camila')
  const mine = await seedBillDueToday(camila.id, 'Luz')
  const target = `/contas?mes=${current}&pagar=${mine}`

  await page.goto(target)
  await expect(page).toHaveURL(/\/entrar\?next=/)
  expect(new URL(page.url()).searchParams.get('next')).toBe(target)
  await page.getByLabel('E-mail').fill(camila.email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(new RegExp(`/contas\\?mes=${current}&pagar=${mine}$`))
  await expect(page.getByRole('alertdialog')).toContainText('Marcar Luz como paga?')
  expect(await statusOf(mine)).toBe('pending')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Marcar como paga', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Conta marcada como paga.' })).toBeVisible()
  expect(await statusOf(mine)).toBe('confirmed')

  // Só os formatos exatos do aviso voltam; qualquer outro destino cai em "Seu mês".
  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  for (const hostile of ['https://exemplo.invalid/x', '//exemplo.invalid/x', `/contas?mes=${current}&pagar=${mine}&x=1`, '/configuracoes']) {
    const p = await other.newPage()
    await entrar(p, camila.email, /\/inicio$/, `/entrar?next=${encodeURIComponent(hostile)}`)
    await p.close()
    await other.clearCookies()
  }
  await other.close()
})

test('desktop: a rota da tarefa não abre sem o código de disparo, nem com a sessão de quem entrou', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Camila')
  const secret = process.env.JOB_SECRET
  // Com a tarefa configurada: 401 igual para ausente e errado. Sem JOB_SECRET no ambiente: 503 (desligada).
  const closed = secret ? 401 : 503
  const body = secret ? { error: 'unauthorized' } : { error: 'not_configured' }
  const none = await request.post(JOB, { data: {} })
  expect(none.status()).toBe(closed)
  expect(await none.json()).toEqual(body)
  const wrong = await request.post(JOB, { data: {}, headers: { [TRIGGER_HEADER]: 'x'.repeat(43) } })
  expect(wrong.status()).toBe(closed)
  expect(await wrong.json()).toEqual(body)
  expect((await request.get(JOB)).status()).toBe(405)
  if (secret) {
    // O próprio segredo no cabeçalho não autoriza: só o código derivado.
    const raw = await request.post(JOB, { data: {}, headers: { [TRIGGER_HEADER]: secret } })
    expect(raw.status()).toBe(401)
  }
  await entrar(page, u.email)
  const withSession = await page.request.post(JOB, { data: {} })
  expect(withSession.status()).toBe(closed)
  expect(await withSession.json()).toEqual(body)
  const fromPage = await page.evaluate(async (path) => (await fetch(path, { method: 'POST', body: '{}' })).status, JOB)
  expect(fromPage).toBe(closed)
  // Nenhuma das respostas deixa cookie ou redireciona para o login.
  expect(withSession.headers()['set-cookie']).toBeUndefined()
})

test('desktop: com o código de disparo, a tarefa pega o lote e responde só números', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop')
  const secret = process.env.JOB_SECRET
  test.skip(!secret, 'defina JOB_SECRET em .env.local (README)')
  const u = await makeUser('Camila')
  await seedBillDueToday(u.id, 'Luz')
  const sub = await admin.from('push_subscriptions').insert({
    user_id: u.id, endpoint: `https://fcm.googleapis.com/fcm/send/${RUN_PREFIX}tarefa`, p256dh: P256DH, auth: AUTH,
  })
  if (sub.error) throw sub.error
  // O banco guarda só o resumo do segredo; este teste registra o do .env.local sob um nome próprio.
  const registered = await admin.rpc('job_secret_set', { p_label: JOB_LABEL, p_hash_hex: createHash('sha256').update(secret!).digest('hex') })
  if (registered.error) throw registered.error
  jobLabelRegistered = true
  const queued = await admin.rpc('job_enqueue_morning_on', { p_today: today })
  if (queued.error) throw queued.error

  const res = await request.post(JOB, { data: {}, headers: { [TRIGGER_HEADER]: triggerToken(secret!) } })
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toContain('no-store')
  const body = await res.json()
  expect(Object.keys(body).sort()).toEqual(['claimed', 'failed', 'removed', 'sent', 'unconfirmed'])
  for (const value of Object.values(body)) expect(typeof value).toBe('number')
  expect(body.claimed).toBeGreaterThanOrEqual(1)
  // A linha foi pega pelo lote: enviada, ou guardada para nova tentativa se o envio recusar o endereço de teste.
  const row = await admin.from('notification_log').select('attempts').eq('user_id', u.id).eq('kind', 'bill_today').single()
  expect(row.data?.attempts).toBe(1)
})

test('desktop: convite por e-mail — mesma resposta para qualquer endereço; chega à caixa local; o link abre o convite; o administrador vê o e-mail e "Reenviar"', async ({ page, browser, request }, info) => {
  test.skip(info.project.name !== 'desktop')
  test.skip(!process.env.SMTP_HOST, 'defina SMTP_HOST, SMTP_PORT e MAIL_FROM em .env.local (README)')
  const camila = await makeUser('Camila')
  const alex = await makeUser('Alex')
  await seedFamily(camila.id, 'Família Souza')
  await entrar(page, camila.email)
  await page.goto('/familia')

  // A Íris não diz se o endereço já tem cadastro: a resposta é a mesma para um endereço sem cadastro.
  const stranger = `${RUN_PREFIX}ninguem@teste.iris.dev`
  await page.getByLabel('E-mail de quem vai participar').fill(stranger)
  await page.getByRole('button', { name: 'Enviar convite', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `Convite enviado para ${stranger}.` })).toBeVisible()

  await page.getByLabel('E-mail de quem vai participar').fill(alex.email)
  await page.getByRole('button', { name: 'Enviar convite', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `Convite enviado para ${alex.email}.` })).toBeVisible()

  // Caixa de e-mail do Supabase local (interface em http://127.0.0.1:54324).
  const MAILBOX = process.env.E2E_MAILBOX_URL ?? 'http://127.0.0.1:54324'
  let text = ''
  await expect.poll(async () => {
    const list = await (await request.get(`${MAILBOX}/api/v1/search`, { params: { query: `to:${alex.email}` } })).json()
    const first = list.messages?.[0]
    if (!first) return ''
    // O assunto é fixo: nenhum nome escolhido por quem convida aparece nele.
    expect(first.Subject).toBe(INVITE_SUBJECT)
    text = (await (await request.get(`${MAILBOX}/api/v1/message/${first.ID}`)).json()).Text as string
    return text
  }).toContain('/convite/')
  const link = text.match(/https?:\/\/\S+\/convite\/[A-Za-z0-9_-]{32}/)?.[0]
  expect(link).toBeTruthy()

  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const alexPage = await other.newPage()
  await entrar(alexPage, alex.email)
  await alexPage.goto(new URL(link!).pathname)
  await expect(alexPage.getByRole('heading', { level: 1, name: 'Entrar na família Família Souza?' })).toBeVisible()
  await other.close()

  await page.reload()
  await expect(page.getByText(alex.email, { exact: true })).toBeVisible()
  await expect(page.getByText('Convite enviado · aguardando')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar convite', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reenviar', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Convite reenviado.' })).toBeVisible()
})
