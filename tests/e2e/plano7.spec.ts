import { expect, test, type BrowserContextOptions, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addMonths, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { dueDateIn, monthName } from '../../src/domain/recurrence'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})
const password = 'senha-forte-123'
const created: string[] = []
const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
// Prefixo único por worker e por execução (celular e desktop rodam em paralelo):
// a varredura de limpeza de um worker nunca apaga usuários do outro.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const WORKER = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0'
const RUN_PREFIX = `e2e-p7-w${WORKER}-${RUN_ID}-`
const today = todayInSaoPaulo()
const current = monthOf(today)
const mes = monthName(Number(current.slice(5)))

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

async function seedExpense(userId: string, key: string, cents: number, occurredOn: string, note?: string): Promise<void> {
  const { error } = await admin.from('transactions').insert({
    user_id: userId, kind: 'expense', amount_cents: cents, category_id: await category(userId, key), occurred_on: occurredOn, note: note ?? null,
  })
  if (error) throw error
}

// Os seeds da família respeitam os gatilhos do banco (a service_role não passa pela RLS, mas as guardas valem).
// Administradora primeiro; `joined_at` crescente; o nome que a família vê vem do perfil.
async function seedFamily(adminId: string, name: string, memberIds: string[]): Promise<string> {
  const { data: fam, error } = await admin.from('families').insert({ name, created_by: adminId }).select('id').single()
  if (error) throw error
  const base = Date.now() - 3_600_000
  const ids = [adminId, ...memberIds]
  for (const [i, userId] of ids.entries()) {
    const { data: profile, error: e1 } = await admin.from('profiles').select('display_name').eq('id', userId).single()
    if (e1) throw e1
    const { error: e2 } = await admin.from('family_members').insert({
      family_id: fam.id, user_id: userId, role: i === 0 ? 'admin' : 'member',
      display_name: profile.display_name, joined_at: new Date(base + i * 60_000).toISOString(),
    })
    if (e2) throw e2
  }
  return fam.id
}

// Gasto da família de hoje; a guarda confere que a pessoa participa.
async function seedFamilyExpense(userId: string, familyId: string, key: string, cents: number): Promise<void> {
  const { error } = await admin.from('transactions').insert({
    user_id: userId, kind: 'expense', amount_cents: cents, category_id: await category(userId, key), occurred_on: today, family_id: familyId,
  })
  if (error) throw error
}

// Molde da conta da família: começa no dia 1 do mês e vence hoje; a ocorrência nasce quando alguém abre o app.
async function seedFamilyBill(userId: string, familyId: string, name: string, cents: number): Promise<void> {
  const { error } = await admin.from('recurrences').insert({
    user_id: userId, kind: 'expense', name, amount_cents: cents, category_id: await category(userId, 'casa'),
    frequency: 'monthly', due_day: Number(today.slice(8)), starts_on: `${current}-01`, family_id: familyId,
  })
  if (error) throw error
}

// Meta da família: sem dono (`user_id` nulo), com quem criou.
async function seedFamilyGoal(familyId: string, createdBy: string, name: string, targetCents: number): Promise<string> {
  const { data, error } = await admin
    .from('goals')
    .insert({ user_id: null, family_id: familyId, created_by: createdBy, name, target_cents: targetCents })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// A guarda só aceita movimento de hoje: grava hoje e, se for o caso, volta a data por atualização administrativa.
async function seedFamilyDeposit(userId: string, goalId: string, cents: number, monthsAgo: number): Promise<void> {
  const { data, error } = await admin
    .from('goal_movements')
    .insert({ user_id: userId, goal_id: goalId, kind: 'deposit', amount_cents: cents, occurred_on: today })
    .select('id')
    .single()
  if (error) throw error
  if (monthsAgo > 0) {
    const { error: e2 } = await admin.from('goal_movements').update({ occurred_on: dueDateIn(addMonths(current, -monthsAgo), 10) }).eq('id', data.id)
    if (e2) throw e2
  }
}

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/inicio/)
}

// Linha do resumo do Seu mês (rótulo + valor).
const line = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..')
// Últimos gastos da família (o bloco de categorias também tem listitem com o mesmo nome).
const recent = (page: Page) => page.getByRole('region', { name: 'Últimos gastos da família' })
// O diálogo de confirmação é um ConfirmPanel (role="alertdialog").
const confirm = (page: Page) => page.getByRole('alertdialog')

test.afterAll(async () => {
  // Excluir o cadastro roda a saída da família no banco; um impasse (40P01) é raro e tentar de novo resolve.
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
})

test('celular: convite por link, o membro entra e anota um gasto da família; cada um só vê o que é da família', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'celular')
  const camila = await makeUser('Camila')
  const alex = await makeUser('Alex')
  await seedExpense(alex.id, 'lazer', 12000, today, 'cinema')

  await entrar(page, camila.email)
  await page.goto('/mais')
  await page.getByRole('link', { name: 'Família', exact: true }).click()
  await page.getByLabel('Nome da família').fill('Família Souza')
  await page.getByRole('button', { name: 'Criar família', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Família criada.')
  await page.getByRole('button', { name: 'Convidar pessoa', exact: true }).click()
  const link = await page.getByLabel('Link do convite').inputValue()
  expect(link).toMatch(/\/convite\/[A-Za-z0-9_-]{32}$/)
  const path = new URL(link).pathname

  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const alexPage = await other.newPage()
  await alexPage.goto(path)
  await expect(alexPage.getByRole('heading', { level: 1, name: 'Você recebeu um convite' })).toBeVisible()
  await alexPage.getByRole('link', { name: 'Entrar', exact: true }).click()
  await alexPage.getByLabel('E-mail').fill(alex.email)
  await alexPage.getByLabel('Senha').fill(password)
  await alexPage.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(alexPage.getByRole('heading', { level: 1, name: 'Entrar na família Família Souza?' })).toBeVisible()
  await alexPage.getByRole('button', { name: 'Entrar na família', exact: true }).click()
  await expect(alexPage).toHaveURL(/\/familia$/)
  await expect(alexPage.getByRole('status')).toContainText('Você entrou na família Família Souza.')

  // Review Focus 2: o link já foi usado.
  await alexPage.goto(path)
  await expect(alexPage.getByText('Este convite não vale mais. Peça um novo link a quem convidou você.')).toBeVisible()

  await alexPage.goto('/anotar')
  await alexPage.getByLabel('Quanto foi?').fill('312,40')
  await alexPage.getByRole('radio', { name: 'Mercado', exact: true }).check({ force: true })
  await alexPage.getByText('Mais detalhes', { exact: true }).click()
  await alexPage.getByLabel('Gasto da família').check()
  await alexPage.getByRole('button', { name: 'Salvar gasto', exact: true }).click()
  await expect(alexPage.getByRole('status')).toContainText('Anotado. Seu mês já está atualizado.')
  await expect(line(alexPage, 'Saiu')).toContainText(brl('432,40'))

  await page.goto('/inicio')
  await expect(line(page, 'Saiu')).toContainText(brl('0,00'))
  await page.getByRole('navigation', { name: 'Ver o mês de' }).getByRole('link', { name: 'Família', exact: true }).click()
  await expect(page.getByText(`Gastos da família em ${mes}`)).toBeVisible()
  await expect(page.getByRole('main')).toContainText(brl('312,40'))
  await expect(recent(page).getByRole('listitem').filter({ hasText: 'Mercado' })).toContainText('Hoje · por Alex')
  // Review Focus 1: nada do privado do Alex.
  await expect(page.getByRole('main')).not.toContainText('cinema')
  await expect(page.getByRole('main')).not.toContainText(brl('120,00'))
  await expect(page.getByText('O Disponível e as entradas de cada pessoa nunca aparecem aqui.')).toBeVisible()
  await other.close()
})

test('celular: conta da família paga pelo membro sai do Disponível dele; meta da família; quem sai recebe a parte', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'celular')
  const camila = await makeUser('Camila')
  const alex = await makeUser('Alex')
  const fam = await seedFamily(camila.id, 'Família Souza', [alex.id])
  await seedFamilyBill(camila.id, fam, 'Aluguel', 180000)
  const goal = await seedFamilyGoal(fam, camila.id, 'Reforma da cozinha', 1_000_000)
  await seedFamilyDeposit(camila.id, goal, 300000, 1)
  await seedFamilyDeposit(alex.id, goal, 180000, 1)

  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const alexPage = await other.newPage()
  await entrar(alexPage, alex.email)
  await alexPage.goto(`/inicio/familia?mes=${current}`)
  const contas = alexPage.getByRole('region', { name: 'Contas da família' })
  await contas.getByRole('button', { name: 'Marcar Aluguel como paga', exact: true }).click()
  await confirm(alexPage).getByRole('button', { name: 'Marcar como paga', exact: true }).click()
  await expect(alexPage.getByRole('status')).toContainText('Conta marcada como paga.')
  await alexPage.getByRole('navigation', { name: 'Ver o mês de' }).getByRole('link', { name: 'Eu', exact: true }).click()
  await expect(line(alexPage, 'Saiu')).toContainText(brl('1.800,00'))

  // A administradora não paga de novo, e o Saiu dela não muda (Review Focus 4).
  await entrar(page, camila.email)
  await expect(line(page, 'Saiu')).toContainText(brl('0,00'))
  await page.goto('/familia/contas')
  await expect(page.getByText('Nenhuma conta da família a pagar.')).toBeVisible()

  await alexPage.goto('/metas')
  // O bloco "Da família" não tem região nomeada: acha a seção pelo título.
  const familia = alexPage.locator('section').filter({ has: alexPage.getByRole('heading', { name: 'Da família', exact: true }) })
  await expect(familia).toContainText('Reforma da cozinha')
  await expect(familia).toContainText(`Sua parte: ${brl('1.800')}`)

  await alexPage.goto('/familia')
  await alexPage.getByRole('button', { name: 'Sair da família', exact: true }).click()
  await expect(confirm(alexPage).getByText('Sair da família?', { exact: true })).toBeVisible()
  await confirm(alexPage).getByRole('button', { name: 'Sair da família', exact: true }).click()
  await expect(alexPage.getByRole('status')).toContainText('Você saiu da família.')
  await expect(alexPage.getByRole('button', { name: 'Criar família', exact: true })).toBeVisible()
  // Review Focus 3: quem saiu não vê mais nada da família. /inicio/familia manda
  // para /familia (o caminho inteiro é conferido: "/inicio/familia" também termina
  // em "/familia"), e lá só há a tela de criar uma família.
  await alexPage.goto(`/inicio/familia?mes=${current}`)
  await expect.poll(() => new URL(alexPage.url()).pathname).toBe('/familia')
  await expect(alexPage.getByRole('button', { name: 'Criar família', exact: true })).toBeVisible()
  await expect(alexPage.getByRole('region', { name: 'Contas da família' })).toHaveCount(0)
  await expect(recent(alexPage)).toHaveCount(0)
  await expect(alexPage.getByRole('main')).not.toContainText('Família Souza')
  await expect(alexPage.getByRole('main')).not.toContainText('Reforma da cozinha')
  await expect(alexPage.getByRole('main')).not.toContainText('Camila')
  // As contas da família também: a tela manda embora do mesmo jeito.
  await alexPage.goto('/familia/contas')
  await expect.poll(() => new URL(alexPage.url()).pathname).toBe('/familia')
  await expect(alexPage.getByRole('button', { name: 'Criar família', exact: true })).toBeVisible()
  // E as metas da família saem da lista dele.
  await alexPage.goto('/metas')
  await expect(alexPage.getByRole('main')).not.toContainText('Reforma da cozinha')
  await alexPage.goto('/inicio')
  await expect(line(alexPage, 'Tirado das metas')).toContainText(brl('1.800,00'))

  await page.goto('/familia')
  await expect(page.getByRole('region', { name: 'Avisos da família' }))
    .toContainText(`Alex saiu da família, e ${brl('1.800,00')} da meta Reforma da cozinha voltaram para Alex.`)
  await other.close()
})

test('desktop: Família pelo menu lateral; a administradora ajusta o gasto do membro e passa a administração; a nova administradora remove', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop')
  const camila = await makeUser('Camila')
  const bia = await makeUser('Bia')
  const caio = await makeUser('Caio')
  const fam = await seedFamily(camila.id, 'Família Souza', [bia.id, caio.id])
  await seedFamilyExpense(bia.id, fam, 'casa', 8990)

  await entrar(page, camila.email)
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Família', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Família Souza' })).toBeVisible()
  await page.getByRole('link', { name: /Ver o mês da família/ }).click()
  await recent(page).getByRole('link').filter({ hasText: 'Casa' }).click()
  await expect(page.getByText('Registrado por Bia')).toBeVisible()
  await page.getByLabel('Quanto foi?').fill('99,90')
  await page.getByRole('button', { name: 'Salvar gasto', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Alterações salvas.')
  await expect(page.getByRole('main')).toContainText(brl('99,90'))

  await page.goto('/familia')
  await page.getByRole('button', { name: 'Tornar Bia administrador', exact: true }).click()
  await confirm(page).getByRole('button', { name: 'Tornar administrador', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Bia agora administra a família.')
  await expect(page.getByRole('button', { name: 'Convidar pessoa', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Remover / })).toHaveCount(0)

  const other = await browser.newContext(info.project.use as BrowserContextOptions)
  const biaPage = await other.newPage()
  await entrar(biaPage, bia.email)
  await expect(line(biaPage, 'Saiu')).toContainText(brl('99,90'))
  await biaPage.goto('/familia')
  await biaPage.getByRole('button', { name: 'Remover Caio da família', exact: true }).click()
  await confirm(biaPage).getByRole('button', { name: 'Remover', exact: true }).click()
  await expect(biaPage.getByRole('status')).toContainText('Caio saiu da família.')
  await other.close()
})
