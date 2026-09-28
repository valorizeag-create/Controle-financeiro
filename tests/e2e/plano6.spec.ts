import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addMonths, monthLabel, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
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
const RUN_PREFIX = `e2e-p6-w${WORKER}-${RUN_ID}-`
const today = todayInSaoPaulo()
const current = monthOf(today)
const previous = addMonths(current, -1)

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

async function seedExpense(userId: string, key: string, cents: number, occurredOn: string): Promise<void> {
  const { error } = await admin.from('transactions').insert({
    user_id: userId, kind: 'expense', amount_cents: cents, category_id: await category(userId, key), occurred_on: occurredOn,
  })
  if (error) throw error
}

async function seedIncome(userId: string, cents: number, occurredOn: string): Promise<void> {
  const { error } = await admin.from('transactions').insert({ user_id: userId, kind: 'income', amount_cents: cents, source: 'Salário', occurred_on: occurredOn })
  if (error) throw error
}

async function seedBudget(userId: string, key: string, cents: number, month: string): Promise<void> {
  const { error } = await admin.from('budgets').insert({ user_id: userId, month: `${month}-01`, category_id: await category(userId, key), amount_cents: cents })
  if (error) throw error
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
const item = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name })

test.afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id)
  const known = new Set(created)
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      if (u.email?.startsWith(RUN_PREFIX) && !known.has(u.id)) await admin.auth.admin.deleteUser(u.id)
    }
    if (data.users.length < 1000) break
    page += 1
  }
})

test('planejar o mês, ajustar o que passou e ver no Seu mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await seedExpense(u.id, 'mercado', 89000, today)
  await seedExpense(u.id, 'lazer', 32000, today)
  await entrar(page, u.email)

  await page.getByRole('link', { name: 'Mais', exact: true }).click()
  await page.getByRole('link', { name: 'Planejamento', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Quanto você quer usar este mês' })).toBeVisible()
  await expect(page.getByText('Você ainda não planejou este mês. Defina quanto quer usar em cada área e a Íris acompanha para você.')).toBeVisible()
  await page.getByRole('link', { name: 'Planejar meu mês', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Planejar meu mês' })).toBeVisible()
  await page.getByLabel('Mercado', { exact: true }).fill('1000')
  await page.getByLabel('Lazer', { exact: true }).fill('300')
  await page.getByRole('button', { name: 'Salvar planejamento', exact: true }).click()

  await expect(page.getByRole('status')).toContainText('Planejamento salvo. Agora é só acompanhar.')
  await expect(item(page, 'Mercado')).toContainText(`${brl('890')} de ${brl('1.000')}`)
  await expect(item(page, 'Mercado')).toContainText(`Ainda tem ${brl('110')} disponível.`)
  await expect(item(page, 'Lazer')).toContainText(`Passou ${brl('20')} do planejado.`)
  await expect(page.getByText('Você está dentro do planejado em 1 de 2 categorias.')).toBeVisible()

  // Decisão 78 (substituída): o link é a pergunta da copy, com o nome da categoria para leitor de tela.
  await expect(page.getByRole('link', { name: /^Ajustar valor/ })).toHaveCount(0)
  await page.getByRole('link', { name: 'Quer ajustar o valor deste mês? Lazer', exact: true }).click()
  await expect(page.getByLabel('Lazer', { exact: true })).toBeFocused()
  await page.getByLabel('Lazer', { exact: true }).fill('abc')
  await page.getByRole('button', { name: 'Salvar planejamento', exact: true }).click()
  await expect(page.getByText('Esse valor não parece certo. Use apenas números.')).toBeVisible()
  await expect(page.getByLabel('Lazer', { exact: true })).toHaveValue('abc')
  await page.getByLabel('Lazer', { exact: true }).fill('350')
  await page.getByRole('button', { name: 'Salvar planejamento', exact: true }).click()
  await expect(item(page, 'Lazer')).toContainText('Falta pouco para chegar ao que você planejou.')

  await page.getByRole('link', { name: 'Seu mês', exact: true }).click()
  const planejado = page.getByRole('region', { name: 'Planejado' })
  await expect(planejado).toContainText(`Você ainda tem ${brl('30')} para Lazer este mês.`)
  await expect(planejado).toContainText('Você está dentro do planejado em 2 de 2 categorias.')
  await expect(planejado.getByRole('link', { name: 'Ver planejamento', exact: true })).toBeVisible()
  await expect(line(page, 'Saiu')).toContainText(brl('1.210,00'))
})

test('repetir o planejamento do mês anterior', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Davi')
  await seedBudget(u.id, 'casa', 50000, previous)
  await seedBudget(u.id, 'transporte', 20000, previous)
  await entrar(page, u.email)

  await page.goto('/planejamento')
  const nome = previous.slice(0, 4) === current.slice(0, 4) ? monthName(Number(previous.slice(5))) : monthLabel(previous)
  const repetir = page.getByRole('button', { name: `Repetir o planejamento de ${nome}`, exact: true })
  await repetir.click()
  await expect(page.getByRole('status')).toContainText('Planejamento salvo. Agora é só acompanhar.')
  await expect(item(page, 'Casa')).toContainText(`${brl('0')} de ${brl('500')}`)
  await expect(item(page, 'Transporte')).toContainText(`${brl('0')} de ${brl('200')}`)
  await expect(page.getByRole('button', { name: /^Repetir o planejamento/ })).toHaveCount(0)
})

test('desktop: relatórios pelo menu lateral, frases, mês a mês e período personalizado', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Bia')
  await seedIncome(u.id, 500000, dueDateIn(previous, 5))
  await seedExpense(u.id, 'comer_fora', 60000, dueDateIn(previous, 10))
  await seedIncome(u.id, 500000, today)
  await seedExpense(u.id, 'comer_fora', 42000, today)
  await entrar(page, u.email)

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Relatórios', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Seus meses em perspectiva' })).toBeVisible()
  const filtros = page.getByRole('navigation', { name: 'Período' })
  await expect(filtros.getByRole('link', { name: 'Últimos 3 meses', exact: true })).toHaveAttribute('aria-current', 'page')

  const mudou = page.getByRole('region', { name: 'O que mudou' })
  await expect(mudou).toContainText(`Em ${monthName(Number(current.slice(5)))}, entrou ${brl('5.000')} e saiu ${brl('420')}.`)
  await expect(mudou).toContainText(`Você gastou ${brl('180')} a menos com Comer fora do que no mês passado.`)
  const mesAMes = page.getByRole('region', { name: 'Mês a mês' })
  await expect(mesAMes).toContainText('até agora')
  await expect(mesAMes).toContainText(`Saiu ${brl('600')}`)
  await expect(page.getByRole('table', { name: 'Entrou e saiu por mês' })).toBeAttached()

  // Review Focus 1: o mesmo "Saiu" do Seu mês.
  await filtros.getByRole('link', { name: 'Mês passado', exact: true }).click()
  await expect(mudou).toContainText(`saiu ${brl('600')}.`)
  await page.goto(`/inicio?mes=${previous}`)
  await expect(line(page, 'Saiu')).toContainText(brl('600,00'))

  // Review Focus 5: período que não vale mostra o aviso e os últimos 3 meses.
  await page.goto('/relatorios?periodo=personalizado')
  await page.getByLabel('De', { exact: true }).fill(current)
  await page.getByLabel('Até', { exact: true }).fill(previous)
  await page.getByRole('button', { name: 'Ver período', exact: true }).click()
  await expect(page.locator('form').getByRole('alert')).toHaveText('Escolha um período de até 12 meses.')
  await expect(page.getByRole('region', { name: 'Mês a mês' })).toContainText('até agora')
})
