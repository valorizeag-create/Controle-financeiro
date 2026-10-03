import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { expect, test, type BrowserContextOptions, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { todayInSaoPaulo } from '../../src/domain/dates'
import { authEmailTestIsLocal, LOCAL_ONLY } from './local-only'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
const password = 'senha-forte-123'
const created: string[] = []
// Prefixo único por worker e por execução: a limpeza de um worker nunca apaga usuários do outro.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const WORKER = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0'
const RUN_PREFIX = `e2e-p9-w${WORKER}-${RUN_ID}-`
const today = todayInSaoPaulo()
const DRAFT = 'Rascunho em revisão. Este texto ainda será revisado pelo responsável pela Íris e por um advogado antes do lançamento.'
const SENT = 'Pronto. Se o novo endereço puder ser usado, os links de confirmação já estão a caminho: um no e-mail atual e outro no novo. A troca só vale depois de confirmar nos dois.'
const CHANGE_SUBJECT = 'Confirme a troca de e-mail na Íris'
const CONFIRM = 'Digite EXCLUIR para confirmar.'
const REAUTH_DELETE = 'Por segurança, saia e entre de novo antes de excluir o cadastro.'
const REAUTH_EMAIL = 'Por segurança, saia e entre de novo antes de trocar o e-mail.'
// Contêiner do banco local (project_id de supabase/config.toml). Só o banco local, nunca o hospedado.
const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? 'supabase_db_Planilha_financeira'
function localSql(sql: string): { ok: boolean; out: string } {
  const r = spawnSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', sql], { encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

async function makeUser(name: string): Promise<{ id: string; email: string }> {
  const email = `${RUN_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
  if (error) throw error
  created.push(data.user.id)
  const { error: e2 } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', data.user.id)
  if (e2) throw e2
  return { id: data.user.id, email }
}
async function category(userId: string, key: string): Promise<string> {
  const { data, error } = await admin.from('categories').select('id').eq('user_id', userId).eq('default_key', key).single()
  if (error) throw error
  return data.id
}
async function seedExpense(userId: string, key: string, cents: number, note: string, extra: Record<string, unknown> = {}): Promise<void> {
  const { error } = await admin.from('transactions').insert({
    user_id: userId, kind: 'expense', amount_cents: cents, category_id: await category(userId, key), occurred_on: today, note, ...extra,
  })
  if (error) throw error
}
// Família com quem administra e, se houver, um membro. As guardas do banco valem para o cliente administrativo.
async function seedFamily(adminId: string, name: string, memberId?: string): Promise<string> {
  const { data: fam, error } = await admin.from('families').insert({ name, created_by: adminId }).select('id').single()
  if (error) throw error
  for (const [id, role] of [[adminId, 'admin'], ...(memberId ? [[memberId, 'member']] : [])] as [string, string][]) {
    const { data: profile, error: e1 } = await admin.from('profiles').select('display_name').eq('id', id).single()
    if (e1) throw e1
    const { error: e2 } = await admin.from('family_members').insert({ family_id: fam.id, user_id: id, role, display_name: profile.display_name })
    if (e2) throw e2
  }
  return fam.id as string
}
// A própria pessoa, pela API: para o que o banco só aceita de quem é dono (meta da família e a parte de cada um).
async function clientOf(email: string) {
  const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}
async function entrar(page: Page, email: string, pass: string = password): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(pass)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/inicio/)
}
const userExists = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user !== null
async function leftovers(id: string, email: string): Promise<string[]> {
  const { data, error } = await admin.rpc('account_leftovers', { p_user: id, p_email: email })
  if (error) throw error
  return (data as { place: string }[]).map((r) => r.place)
}

test.afterAll(async () => {
  // Quem foi excluído pela tela já não existe: só o resto é apagado, com uma nova tentativa se houver impasse.
  const remove = async (id: string) => {
    if (!(await userExists(id))) return
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
})

test('celular: Termos e Privacidade são públicos, em rascunho, e o cadastro e o entrar levam a eles', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'celular')
  for (const [path, title] of [['/termos', 'Termos de uso'], ['/privacidade', 'Política de privacidade']] as const) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(200)
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('note')).toHaveText(DRAFT)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  }
  await expect(page.getByText('Configurações → Seus dados → Excluir meu cadastro', { exact: false })).toBeVisible()
  await expect(page.getByText('Não há cookies de publicidade nem de medição.')).toBeVisible()

  await page.goto('/criar-cadastro')
  await page.getByRole('link', { name: 'Termos de uso', exact: true }).click()
  await expect(page).toHaveURL(/\/termos$/)
  await page.goto('/entrar')
  await page.getByRole('link', { name: 'Política de privacidade', exact: true }).click()
  await expect(page).toHaveURL(/\/privacidade$/)

  // Caminhos parecidos não são públicos.
  for (const path of ['/termos/x', '/configuracoes/dados', '/configuracoes/excluir', '/configuracoes/e-mail']) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(307)
    expect(res.headers().location, path).toContain('/entrar')
  }
})

test('desktop: baixar meus dados — CSV só com o que é da pessoa, sem fórmula, sem cache; sem sessão não baixa', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop')
  const camila = await makeUser('Camila')
  const alex = await makeUser('Alex')
  const fam = await seedFamily(camila.id, 'Família Souza', alex.id)
  await seedExpense(camila.id, 'mercado', 14230, '=1+1')
  await seedExpense(camila.id, 'casa', 9900, 'aluguel', { family_id: fam })
  const { error: incomeError } = await admin.from('transactions').insert({
    user_id: camila.id, kind: 'income', amount_cents: 500_000, source: 'Salário', occurred_on: today,
  })
  if (incomeError) throw incomeError
  // De outra pessoa: um gasto pessoal e um da família. Nenhum dos dois entra no arquivo da Camila.
  await seedExpense(alex.id, 'lazer', 777, 'segredo-pessoal-do-alex')
  await seedExpense(alex.id, 'mercado', 4321, 'gasto-da-familia-do-alex', { family_id: fam })

  await entrar(page, camila.email)
  await page.goto('/configuracoes')
  await page.getByRole('link', { name: 'Baixar meus dados', exact: true }).click()
  await expect(page).toHaveURL(/\/configuracoes\/dados$/)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Baixar arquivo', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^iris-meus-dados-\d{4}-\d{2}-\d{2}\.csv$/)
  const file = await download.path()
  const bytes = await readFile(file!)
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const csv = bytes.toString('utf8')
  expect(csv).toContain('"Registros"\r\n')
  expect(csv).toContain(`;"Gasto";"Confirmado";142,30;"Mercado";;"'=1+1";`)
  expect(csv).toContain(';"Gasto";"Confirmado";99,00;"Casa";;"aluguel";')
  expect(csv).toContain(';"Entrada";"Confirmado";5000,00;;"Salário";')
  expect(csv).toContain(`"Camila";"${camila.email}";`)
  expect(csv).toContain('"Família Souza";"Administra";')
  for (const foreign of ['segredo-pessoal-do-alex', 'gasto-da-familia-do-alex', 'Alex', alex.email, camila.id, alex.id, fam]) {
    expect(csv, foreign).not.toContain(foreign)
  }
  expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)

  // Cabeçalhos da resposta, com a sessão da página.
  const res = await page.request.get('/configuracoes/dados/exportar')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('text/csv; charset=utf-8')
  expect(res.headers()['cache-control']).toContain('no-store')
  expect(res.headers()['content-disposition']).toMatch(/^attachment; filename="iris-meus-dados-/)
  // Vindo de outro site: nada é baixado.
  const cross = await page.request.get('/configuracoes/dados/exportar', { headers: { 'sec-fetch-site': 'cross-site' }, maxRedirects: 0 })
  expect(cross.status()).toBe(303)
  // Sem sessão: vai para Entrar.
  const anon = await request.get('/configuracoes/dados/exportar', { maxRedirects: 0 })
  expect(anon.status()).toBe(307)
  expect(anon.headers().location).toContain('/entrar')
  // O service worker não guardou nada do app.
  const cached = await page.evaluate(async () => {
    const names = await caches.keys()
    const urls = await Promise.all(names.map(async (n) => (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname)))
    return urls.flat()
  })
  expect(cached.filter((p) => p.startsWith('/configuracoes'))).toEqual([])
})

test('celular: excluir o cadastro — aviso, palavra EXCLUIR, sessão encerrada, nada fica; a senha antiga não entra mais', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await seedExpense(u.id, 'mercado', 14230, 'feira')

  await entrar(page, u.email)
  await page.goto('/configuracoes')
  await page.getByRole('link', { name: 'Excluir meu cadastro', exact: true }).click()
  await expect(page).toHaveURL(/\/configuracoes\/excluir$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Excluir seu cadastro', exact: true })).toBeVisible()
  await expect(page.getByText('Todos os seus dados serão apagados de forma permanente: registros, categorias, metas e planejamentos. Isso não pode ser desfeito.')).toBeVisible()
  await expect(page.getByText(/também sairá delas/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Baixar meus dados antes', exact: true })).toHaveAttribute('href', '/configuracoes/dados')
  await expect(page.getByRole('link', { name: 'Manter meu cadastro', exact: true })).toHaveAttribute('href', '/configuracoes')

  // Palavra errada: nada acontece.
  await page.getByLabel(CONFIRM).fill('excluir')
  await page.getByRole('button', { name: 'Excluir meu cadastro', exact: true }).click()
  await expect(page.getByLabel(CONFIRM)).toHaveAttribute('aria-invalid', 'true')
  await expect(page).toHaveURL(/\/configuracoes\/excluir$/)
  expect(await userExists(u.id)).toBe(true)

  await page.getByLabel(CONFIRM).fill('EXCLUIR')
  await page.getByRole('button', { name: 'Excluir meu cadastro', exact: true }).click()
  await expect(page).toHaveURL(/\/cadastro-excluido$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Seu cadastro foi excluído.', exact: true })).toBeVisible()
  await expect(page.getByText('Obrigado por ter usado a Íris.', { exact: true })).toBeVisible()

  expect(await userExists(u.id)).toBe(false)
  expect(await leftovers(u.id, u.email)).toEqual([])
  // A sessão acabou neste aparelho, e a senha antiga não entra mais.
  await page.goto('/inicio')
  await expect(page).toHaveURL(/\/entrar/)
  await page.getByLabel('E-mail').fill(u.email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'E-mail ou senha não conferem. Tente de novo ou crie uma nova senha.' })).toBeVisible()
})

test('desktop: excluir o cadastro com parte numa meta da família — aviso com o valor; a família fica com "Ex-membro" e o aviso sem nome', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop')
  const ana = await makeUser('Ana')
  const bia = await makeUser('Bia')
  const fam = await seedFamily(ana.id, 'Família Souza', bia.id)
  await seedExpense(bia.id, 'mercado', 4000, 'feira da Bia', { family_id: fam })
  const anaApi = await clientOf(ana.email)
  const goal = await anaApi.rpc('create_family_goal', { p_name: 'Reforma', p_target_cents: 1_000_000, p_deadline: null })
  if (goal.error) throw goal.error
  const biaApi = await clientOf(bia.email)
  const dep = await biaApi.rpc('deposit_family_goal', { p_goal_id: goal.data, p_amount_cents: 3000 })
  if (dep.error) throw dep.error

  await entrar(page, bia.email)
  await page.goto('/configuracoes/excluir')
  await expect(page.getByText('Seus dados pessoais serão apagados. Os gastos que você registrou na família continuam no histórico dela, sem o seu nome.')).toBeVisible()
  await expect(page.getByText(/Sua parte nas metas da família \(R\$\s30,00\) também sairá delas\./)).toBeVisible()
  await expect(page.getByText('A administração da família passa para quem participa há mais tempo.')).toHaveCount(0)
  await page.getByLabel(CONFIRM).fill('EXCLUIR')
  await page.getByRole('button', { name: 'Excluir meu cadastro', exact: true }).click()
  await expect(page).toHaveURL(/\/cadastro-excluido$/)
  expect(await userExists(bia.id)).toBe(false)
  expect(await leftovers(bia.id, bia.email)).toEqual([])

  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const anaPage = await other.newPage()
  await entrar(anaPage, ana.email)
  await anaPage.goto('/familia')
  await expect(anaPage.getByText('Um membro saiu da família, e a meta Reforma foi atualizada.')).toBeVisible()
  await expect(anaPage.getByText('Bia', { exact: true })).toHaveCount(0)
  await anaPage.goto('/inicio/familia')
  await expect(anaPage.getByText('Ex-membro').first()).toBeVisible()
  await expect(anaPage.getByText(/· por Ex-membro/).first()).toBeVisible()
  await other.close()
})

test('desktop: sessão com mais de 15 minutos — excluir o cadastro e trocar o e-mail pedem sair e entrar de novo; depois do novo acesso, o formulário volta', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  // O relógio de uma sessão só se muda dentro do banco (a API não deixa): usa o psql do contêiner local.
  test.skip(!authEmailTestIsLocal() || !localSql('select 1').ok, 'precisa do banco local em Docker (psql no contêiner ' + DB_CONTAINER + ')')
  const u = await makeUser('Camila')

  await entrar(page, u.email)
  await page.goto('/configuracoes/excluir')
  await expect(page.getByLabel(CONFIRM)).toBeVisible() // sessão recém-criada: o formulário aparece
  const aged = localSql(`update auth.sessions set created_at = now() - interval '16 minutes' where user_id = '${u.id}'`)
  expect(aged.ok, aged.out).toBe(true)

  await page.goto('/configuracoes/excluir')
  await expect(page.getByRole('alert').filter({ hasText: REAUTH_DELETE })).toBeVisible()
  await expect(page.getByLabel(CONFIRM)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Excluir meu cadastro', exact: true })).toHaveCount(0)
  await page.goto('/configuracoes/e-mail')
  await expect(page.getByRole('alert').filter({ hasText: REAUTH_EMAIL })).toBeVisible()
  await expect(page.getByLabel('Novo e-mail')).toHaveCount(0)
  expect(await userExists(u.id)).toBe(true)

  // Sair e entrar de novo: a sessão nova é recente.
  await page.getByRole('button', { name: 'Sair da Íris' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/entrar$/)
  await entrar(page, u.email)
  await page.goto('/configuracoes/excluir')
  await expect(page.getByLabel(CONFIRM)).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: REAUTH_DELETE })).toHaveCount(0)
})

test('desktop: trocar e-mail — mesma resposta para endereço já cadastrado; abrir o link não troca nada; só vale depois dos dois; confirmar não inicia sessão', async ({ page, browser, request }, info) => {
  test.skip(info.project.name !== 'desktop')
  // Guarda de segurança, não atalho: o Supabase Auth envia e-mail para endereços de teste. Só com o banco local.
  test.skip(!authEmailTestIsLocal(), LOCAL_ONLY)
  const u = await makeUser('Camila')
  const other = await makeUser('Alex')
  const novo = `${RUN_PREFIX}novo-${Date.now()}@teste.iris.dev`
  const emailOf = async () => (await admin.auth.admin.getUserById(u.id)).data.user?.email

  await entrar(page, u.email)
  await page.goto('/configuracoes')
  await page.getByRole('link', { name: new RegExp(u.email.replace(/[.+]/g, '\\$&')) }).click()
  await expect(page).toHaveURL(/\/configuracoes\/e-mail$/)

  // Endereço de outro cadastro: a mesma resposta.
  await page.getByLabel('Novo e-mail').fill(other.email)
  await page.getByRole('button', { name: 'Enviar link', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: SENT })).toBeVisible()
  await page.reload()
  await page.getByLabel('Novo e-mail').fill(novo)
  await page.getByRole('button', { name: 'Enviar link', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: SENT })).toBeVisible()

  const MAILBOX = process.env.E2E_MAILBOX_URL ?? 'http://127.0.0.1:54324'
  const linkFor = async (to: string): Promise<string> => {
    let found = ''
    await expect.poll(async () => {
      const list = await (await request.get(`${MAILBOX}/api/v1/search`, { params: { query: `to:${to} subject:"${CHANGE_SUBJECT}"` } })).json()
      const first = list.messages?.[0]
      if (!first) return ''
      const message = await (await request.get(`${MAILBOX}/api/v1/message/${first.ID}`)).json()
      found = `${message.Text ?? ''}\n${message.HTML ?? ''}`.match(/https?:\/\/[^\s"<]+\/confirmar-email\?token_hash=[A-Za-z0-9_-]+/)?.[0] ?? ''
      return found
    }).toContain('/confirmar-email?token_hash=')
    const parsed = new URL(found)
    return `${parsed.pathname}${parsed.search}`
  }
  const atual = await linkFor(u.email)
  const noNovo = await linkFor(novo)
  expect(atual).not.toBe(noNovo)

  // Outro navegador, sem sessão (como um celular ou um leitor de e-mail).
  const ctx = await browser.newContext(info.project.use as BrowserContextOptions)
  const p = await ctx.newPage()
  await p.goto(atual)
  await expect(p.getByRole('heading', { level: 1, name: 'Confirmar troca de e-mail', exact: true })).toBeVisible()
  expect(await emailOf()).toBe(u.email) // abrir o link não confirma nada
  await p.getByRole('button', { name: 'Confirmar troca de e-mail', exact: true }).click()
  await expect(p.getByRole('status').filter({ hasText: 'Falta um passo. Confirme também pelo link enviado ao outro endereço.' })).toBeVisible()
  expect(await emailOf()).toBe(u.email)

  await p.goto(noNovo)
  await p.getByRole('button', { name: 'Confirmar troca de e-mail', exact: true }).click()
  await expect(p.getByRole('status').filter({ hasText: 'E-mail alterado. Use o novo endereço para entrar.' })).toBeVisible()
  expect(await emailOf()).toBe(novo)

  // Confirmar não iniciou sessão neste navegador, e o link usado não vale de novo.
  await p.goto('/inicio')
  await expect(p).toHaveURL(/\/entrar/)
  await p.goto(noNovo)
  await p.getByRole('button', { name: 'Confirmar troca de e-mail', exact: true }).click()
  await expect(p.getByText('Este link não vale mais. Peça a troca de novo em Configurações.')).toBeVisible()
  // O novo endereço entra; a sessão que pediu a troca mostra o novo e-mail.
  await entrar(p, novo)
  await ctx.close()
  await page.goto('/configuracoes')
  await expect(page.getByText(novo, { exact: true })).toBeVisible()
  // O outro cadastro não foi tocado.
  expect((await admin.auth.admin.getUserById(other.id)).data.user?.email).toBe(other.email)
})
