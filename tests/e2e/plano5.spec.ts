import { expect, test, type Page } from '@playwright/test'
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
const RUN_PREFIX = `e2e-p5-w${WORKER}-${RUN_ID}-`
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

// Meta com um guardar no mês passado (o gatilho do banco confere o guardado).
async function seedGoal(userId: string, name: string, targetCents: number, depositCents: number): Promise<string> {
  const { data, error } = await admin.from('goals').insert({ user_id: userId, name, target_cents: targetCents }).select('id').single()
  if (error) throw error
  const { error: e2 } = await admin.from('goal_movements').insert({
    user_id: userId, goal_id: data.id, kind: 'deposit', amount_cents: depositCents, occurred_on: dueDateIn(previous, 10),
  })
  if (e2) throw e2
  return data.id
}

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/inicio/)
}

// Rádios escondidos (chips): clica no rótulo que contém o rádio com esse nome exato.
async function pick(page: Page, name: string): Promise<void> {
  await page.locator('label', { has: page.getByRole('radio', { name, exact: true }) }).click()
}

// Linha do resumo do Seu mês (rótulo + valor).
const line = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..')

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

test('meta: criar, guardar, tirar e ver no Seu mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await entrar(page, u.email)

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Metas', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Suas metas' })).toBeVisible()
  await expect(page.getByText('Nenhuma meta por enquanto. Uma viagem, uma reserva, um presente: o que você quer tornar possível?')).toBeVisible()
  await page.getByRole('link', { name: 'Criar meta', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Criar meta' })).toBeVisible()
  await page.getByLabel('Para o que você quer guardar?').fill('Viagem para Salvador')
  await page.getByLabel('Quanto você precisa?').fill('4000')
  await page.getByLabel('Até quando? (opcional)').fill(addMonths(current, 6))
  await page.getByRole('button', { name: 'Criar meta', exact: true }).click()

  await expect(page.getByRole('status')).toContainText('Meta criada. O primeiro passo já foi dado.')
  await expect(page.getByRole('heading', { level: 1, name: 'Viagem para Salvador' })).toBeVisible()
  const resumo = page.getByTestId('meta-resumo')
  await expect(resumo).toContainText(`Faltam ${brl('4.000,00')} para Viagem para Salvador.`)
  await expect(resumo).toContainText(`guarde cerca de ${brl('667')} por mês`)

  await page.getByRole('link', { name: 'Guardar dinheiro', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Guardar dinheiro nesta meta' })).toBeVisible()
  await page.getByLabel('Quanto você quer guardar?').fill('2000')
  await page.getByRole('button', { name: 'Guardar dinheiro', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Metade do caminho até Viagem para Salvador.')
  await expect(page.getByRole('region', { name: 'Histórico' })).toContainText(`+ ${brl('2.000,00')}`)

  // Tirar mais do que tem: mensagem calma, valor digitado continua (Review Focus 4).
  await page.getByRole('link', { name: 'Tirar dinheiro', exact: true }).click()
  await page.getByLabel('Quanto você quer tirar?').fill('5000')
  await page.getByRole('button', { name: 'Tirar dinheiro', exact: true }).click()
  await expect(page.getByText(`Esta meta tem ${brl('2.000,00')}. Tire até esse valor.`)).toBeVisible()
  await expect(page.getByLabel('Quanto você quer tirar?')).toHaveValue('5000')
  await page.getByLabel('Quanto você quer tirar?').fill('200')
  await page.getByRole('button', { name: 'Tirar dinheiro', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Pronto. O valor voltou para o seu mês.')

  await page.getByRole('link', { name: 'Seu mês', exact: true }).click()
  await expect(line(page, 'Guardado este mês')).toContainText(brl('1.800,00'))
  const destaque = page.getByRole('region', { name: 'Meta em destaque' })
  await expect(destaque).toContainText('Viagem para Salvador')
  await expect(destaque).toContainText('45%')
  await expect(destaque.getByRole('link', { name: 'Guardar dinheiro', exact: true })).toBeVisible()
})

test('usar o dinheiro: a meta paga, a sobra volta e o gasto não sai do mês', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Davi')
  await seedGoal(u.id, 'Viagem para Salvador', 400000, 248000)
  await entrar(page, u.email)

  await page.goto('/metas')
  await page.getByRole('link', { name: /^Viagem para Salvador/ }).click()
  await page.getByRole('link', { name: 'Usar o dinheiro', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Usar o dinheiro da meta' })).toBeVisible()
  await expect(page.getByText(`Você tem ${brl('2.480,00')} guardados em Viagem para Salvador.`)).toBeVisible()
  await page.getByLabel('Quanto foi o gasto?').fill('2300')
  await pick(page, 'Lazer')
  await page.getByRole('button', { name: 'Usar o dinheiro da meta', exact: true }).click()

  const sobra = page.getByRole('dialog', { name: `Sobraram ${brl('180,00')} na meta. Quer devolver para o seu mês?` })
  await expect(sobra).toContainText('Anotado. Seu mês já está atualizado.')
  await sobra.getByRole('button', { name: 'Devolver', exact: true }).click()
  await expect(page).toHaveURL(/\/inicio/)
  await expect(page.getByRole('status')).toContainText('Devolvido. Seu mês já está atualizado.')
  // RN-15: o gasto pago com a meta não sai do mês; a sobra devolvida volta ao Disponível (Review Focus 2).
  await expect(line(page, 'Saiu')).toContainText(brl('0,00'))
  await expect(line(page, 'Tirado das metas')).toContainText(brl('180,00'))

  await page.goto('/extrato')
  const hoje = page.getByRole('region', { name: 'Hoje' })
  await expect(hoje).toContainText('pago com a meta Viagem para Salvador')
  await expect(hoje).toContainText(brl('2.300,00'))
  await expect(hoje).toContainText('Tirado da meta')

  await page.goto('/metas')
  await expect(page.getByRole('region', { name: 'Concluídas' })).toContainText(`Viagem para Salvador · usada em ${monthName(Number(current.slice(5)))}`)
})

test('desktop: Metas no menu lateral, meta completa e excluir devolve o guardado', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Bia')
  await seedGoal(u.id, 'Reserva', 50000, 50000)
  await entrar(page, u.email)

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Metas', exact: true }).click()
  await expect(page).toHaveURL(/\/metas$/)
  await expect(page.getByText('Guardado em metas', { exact: true }).locator('..')).toContainText(brl('500,00'))
  await page.getByRole('link', { name: /^Reserva/ }).click()
  await expect(page.getByText('Você chegou lá. Reserva está completa.')).toBeVisible()

  await page.getByRole('link', { name: 'Mais opções', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar meta' })).toBeVisible()
  await page.getByRole('button', { name: 'Excluir', exact: true }).click()
  const confirmar = page.getByRole('alertdialog', { name: 'Excluir Reserva?' })
  await expect(confirmar).toContainText('O valor guardado continua registrado no seu histórico.')
  await expect(confirmar).toContainText(`${brl('500,00')} volta para o seu Disponível deste mês.`)
  await confirmar.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Meta excluída.')
  await expect(page.getByText('Nenhuma meta por enquanto. Uma viagem, uma reserva, um presente: o que você quer tornar possível?')).toBeVisible()

  // Review Focus 3: o guardado volta hoje; o mês passado continua mostrando o que foi guardado.
  await page.goto('/inicio')
  await expect(line(page, 'Tirado das metas')).toContainText(brl('500,00'))
  await page.goto(`/inicio?mes=${previous}`)
  await expect(line(page, 'Guardado este mês')).toContainText(brl('500,00'))
})
