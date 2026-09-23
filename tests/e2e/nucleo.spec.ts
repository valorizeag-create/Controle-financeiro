import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const signupEmail = `e2e-cadastro-${stamp}@teste.iris.dev`
const loginEmail = `e2e-entrar-${stamp}@teste.iris.dev`
const password = 'senha-forte-123'
let loginUserId = ''

// Cada projeto (celular, desktop) roda este arquivo em separado: cada um cria o seu usuário de login.
test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: loginEmail, password, email_confirm: true, user_metadata: { display_name: 'Bia' },
  })
  if (error) throw error
  loginUserId = data.user.id
})

test.afterAll(async () => {
  if (loginUserId) await admin.auth.admin.deleteUser(loginUserId)
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const signup = data.users.find((u) => u.email === signupEmail)
  if (signup) await admin.auth.admin.deleteUser(signup.id)
})

async function entrar(page: import('@playwright/test').Page) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(loginEmail)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Oi, Bia.' })).toBeVisible()
}

test('criar cadastro, anotar gasto e entrada, ver o mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'O cadastro roda uma vez; o desktop é verificado no teste seguinte.')

  await page.goto('/inicio')
  await expect(page).toHaveURL(/\/entrar$/)

  await page.goto('/criar-cadastro')
  await page.getByLabel('Como podemos te chamar?').fill('Camila')
  await page.getByLabel('Seu e-mail').fill(signupEmail)
  await page.getByLabel('Crie uma senha').fill(password)
  await page.getByRole('button', { name: 'Criar meu cadastro' }).click()

  await expect(page.getByRole('heading', { name: 'Oi, Camila.' })).toBeVisible()
  await expect(page.getByText('Seu mês começa aqui.', { exact: false })).toBeVisible()

  await page.getByRole('link', { name: 'Anotar primeiro gasto' }).click()
  await page.getByLabel('Quanto foi?').fill('142,30')
  await page.getByRole('radio', { name: 'Mercado' }).check({ force: true })
  await page.getByRole('button', { name: 'Salvar gasto' }).click()

  await expect(page.getByRole('status')).toHaveText('Anotado. Seu mês já está atualizado.')
  await expect(page.getByTestId('disponivel')).toHaveText('−R$ 142,30')
  await expect(page.getByText('Seu maior gasto foi com')).toContainText('Mercado')

  await page.goto('/anotar?tipo=entrada')
  await page.getByLabel('Quanto entrou?').fill('5.000')
  await page.getByRole('radio', { name: 'Salário' }).check({ force: true })
  await page.getByRole('button', { name: 'Salvar entrada' }).click()

  await expect(page.getByRole('status')).toHaveText('Anotado. Mais R$ 5.000,00 no seu mês.')
  await expect(page.getByTestId('disponivel')).toHaveText('R$ 4.857,70')
})

test('mensagens de erro do formulário mantêm o que foi digitado', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  await entrar(page)
  await page.goto('/anotar')
  await page.getByLabel('Quanto foi?').fill('12a')
  await page.getByRole('button', { name: 'Salvar gasto' }).click()
  await expect(page.getByText('Esse valor não parece certo. Use apenas números.')).toBeVisible()
  await expect(page.getByText('Escolha uma categoria para esse gasto.')).toBeVisible()
  await expect(page.getByLabel('Quanto foi?')).toHaveValue('12a')
})

test('desktop mostra o menu lateral', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  await entrar(page)
  await expect(page.getByRole('complementary').getByRole('link', { name: 'Seu mês' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('disponivel')).toBeVisible()
})
