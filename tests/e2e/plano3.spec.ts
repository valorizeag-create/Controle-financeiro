import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addDays, addMonths, dayMonthLabel, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { monthName } from '../../src/domain/recurrence'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})
const password = 'senha-forte-123'
const created: string[] = []
const NBSP = String.fromCharCode(0xa0)
const RUN_PREFIX = 'e2e-p3-'
const today = todayInSaoPaulo()
const day = Number(today.slice(8, 10))

async function makeUser(name: string): Promise<{ id: string; email: string }> {
  const email = `${RUN_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
  if (error) throw error
  created.push(data.user.id)
  const { error: e2 } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', data.user.id)
  if (e2) throw e2
  return { id: data.user.id, email }
}

async function categoryOf(userId: string, key: string): Promise<string> {
  const { data, error } = await admin.from('categories').select('id').eq('user_id', userId).eq('default_key', key).single()
  if (error) throw error
  return data.id
}

async function addTx(userId: string, row: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from('transactions').insert({ user_id: userId, ...row })
  if (error) throw error
}

async function addRecurrence(userId: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from('recurrences').insert({ user_id: userId, ...row }).select('id').single()
  if (error) throw error
  return data.id
}

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/inicio/)
}

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

test('conta que se repete: criar, aparece a pagar, marcar como paga pelo Seu mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await addTx(u.id, { kind: 'income', amount_cents: 100000, source: 'Salário', occurred_on: today })
  await entrar(page, u.email)

  await page.getByRole('link', { name: 'Mais' }).click()
  await page.getByRole('link', { name: 'Contas' }).click()
  await expect(page.getByRole('heading', { name: 'Contas' })).toBeVisible()
  await page.getByRole('link', { name: 'Nova conta' }).click()
  await page.getByLabel('Nome').fill('Luz')
  await page.getByLabel('Valor').fill('180')
  await page.getByText('Casa', { exact: true }).click()
  await page.getByLabel('Vence dia').fill(String(day))
  await page.getByRole('button', { name: 'Salvar conta' }).click()

  await expect(page.getByRole('status')).toContainText('Conta criada.')
  await expect(page.getByRole('link', { name: 'A pagar · 1' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText(`R$${NBSP}180,00 · vence dia ${day} · hoje`)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Contas que se repetem' })).toContainText(`Todo mês · dia ${day}`)
  const resumo = page.getByTestId('contas-resumo')
  await expect(resumo).toContainText(`R$${NBSP}180,00`)
  await expect(resumo).toContainText(`R$${NBSP}820,00`)

  // Recarregar não cria outra ocorrência (Review Focus 1).
  await page.reload()
  await expect(page.getByRole('link', { name: 'A pagar · 1' })).toBeVisible()

  await page.goto('/inicio')
  const proximas = page.getByRole('region', { name: 'Próximas contas' })
  await expect(proximas).toContainText('Luz vence hoje')
  await expect(page.getByText('Disponível depois das contas').locator('..')).toContainText(`R$${NBSP}820,00`)
  await expect(page.getByTestId('disponivel')).toHaveText(`R$${NBSP}1.000,00`)

  await proximas.getByRole('button', { name: 'Marcar Luz como paga' }).click()
  await page.getByRole('alertdialog', { name: 'Marcar Luz como paga?' }).getByRole('button', { name: 'Marcar como paga' }).click()
  await expect(page.getByRole('status')).toContainText('Conta marcada como paga.')
  await expect(page.getByTestId('disponivel')).toHaveText(`R$${NBSP}820,00`)
  await expect(page.getByText('Disponível depois das contas').locator('..')).toContainText(`R$${NBSP}820,00`)
  await expect(page.getByRole('region', { name: 'Próximas contas' })).toHaveCount(0)

  await page.goto('/contas?aba=pagas')
  await expect(page.getByText(`R$${NBSP}180,00 · paga em ${dayMonthLabel(today)}`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'A pagar · 0' })).toBeVisible()
})

test('entrada que se repete: Recebi com valor ajustado; Anotar com "Isso se repete"', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Davi')
  await addRecurrence(u.id, {
    kind: 'income', name: 'Freela', amount_cents: 80000, source: 'Freela', frequency: 'monthly', due_day: day, starts_on: today,
  })
  await entrar(page, u.email)

  await page.goto('/contas')
  const receber = page.getByRole('region', { name: 'Entradas a receber' })
  await expect(receber).toContainText(`R$${NBSP}800,00 · previsto para dia ${day}`)
  await receber.getByRole('link', { name: 'Recebi Freela' }).click()
  await expect(page.getByLabel('Quanto entrou?')).toHaveValue('800,00')
  await page.getByLabel('Quanto entrou?').fill('750')
  await page.getByRole('button', { name: 'Confirmar entrada' }).click()
  await expect(page.getByRole('status')).toContainText(`Anotado. Mais R$${NBSP}750,00 no seu mês.`)
  await expect(page.getByRole('region', { name: 'Entradas a receber' })).toHaveCount(0)

  await page.goto('/inicio')
  await expect(page.getByText('Entrou', { exact: true }).locator('..')).toContainText(`R$${NBSP}750,00`)

  await page.goto('/anotar?tipo=entrada')
  await page.getByLabel('Quanto entrou?').fill('5000')
  await page.getByText('Salário', { exact: true }).click()
  await page.getByLabel('Isso se repete').check()
  await page.getByText('Todo ano', { exact: true }).click()
  await page.getByRole('button', { name: 'Salvar entrada' }).click()
  await expect(page.getByRole('status')).toContainText('Anotado.')

  await page.goto('/contas')
  const entradas = page.getByRole('region', { name: 'Entradas que se repetem' })
  await expect(entradas).toContainText('Salário')
  await expect(entradas).toContainText(`Todo ano · ${monthName(Number(today.slice(5, 7)))}`)
})

test('desktop: Contas no menu lateral; vencida aparece calma; encerrar mantém o histórico', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Bia')
  const casa = await categoryOf(u.id, 'casa')
  const yesterday = addDays(today, -1)
  await addTx(u.id, { kind: 'expense', amount_cents: 12000, category_id: casa, note: 'Internet', occurred_on: yesterday, due_on: yesterday, status: 'pending' })
  await addRecurrence(u.id, {
    kind: 'expense', name: 'Academia', amount_cents: 9000, category_id: casa, frequency: 'monthly', due_day: 5,
    starts_on: `${addMonths(monthOf(today), 1)}-05`,
  })
  await entrar(page, u.email)

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Contas' }).click()
  await expect(page).toHaveURL(/\/contas$/)
  await page.getByRole('link', { name: 'Vencidas · 1' }).click()
  await expect(page.getByText(`R$${NBSP}120,00 · venceu em ${dayMonthLabel(yesterday)}`)).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/atrasad/i)

  await page.getByRole('link', { name: /Academia/ }).click()
  await expect(page.getByRole('heading', { name: 'Academia' })).toBeVisible()
  await page.getByRole('button', { name: 'Encerrar' }).click()
  await page.getByRole('alertdialog', { name: 'Encerrar "Academia"?' }).getByRole('button', { name: 'Encerrar' }).click()
  await expect(page.getByRole('status')).toContainText('Encerrada. O histórico continua no Extrato.')
  await expect(page.getByRole('region', { name: 'Contas que se repetem' })).toContainText('Nenhuma conta que se repete ainda.')
})
