import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addMonths, dayMonthLabel, monthOf, todayInSaoPaulo } from '../../src/domain/dates'
import { dueDateIn, monthName } from '../../src/domain/recurrence'
import { splitInstallments } from '../../src/domain/installments'

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
const RUN_PREFIX = `e2e-p4-w${WORKER}-${RUN_ID}-`
const today = todayInSaoPaulo()
const current = monthOf(today)
const next = addMonths(current, 1)
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

async function addCard(userId: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from('cards').insert({ user_id: userId, ...row }).select('id').single()
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

// Rádios escondidos (chips, tipo, cor): clica no rótulo que contém o rádio com esse nome exato.
async function pick(page: Page, name: string): Promise<void> {
  await page.locator('label', { has: page.getByRole('radio', { name, exact: true }) }).click()
}

const saiu = (page: Page) => page.getByText('Saiu', { exact: true }).locator('..')

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

test('cartão: cadastrar, anotar com um toque, ver o total e excluir sem mudar valores', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Camila')
  await entrar(page, u.email)

  await page.getByRole('link', { name: 'Mais', exact: true }).click()
  await page.getByRole('link', { name: 'Cartões', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Cartões' })).toBeVisible()
  await expect(page.getByText('Nenhum cartão por enquanto. Adicione um para ver quanto gastou com ele em cada mês.')).toBeVisible()
  await page.getByRole('link', { name: 'Adicionar', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Novo cartão' })).toBeVisible()
  await page.getByLabel('Como você chama esse cartão?').fill('Nubank pessoal')
  await pick(page, 'Roxo')
  await expect(page.getByTestId('card-face')).toContainText('Nubank pessoal')
  await page.getByRole('button', { name: 'Salvar cartão', exact: true }).click()

  await expect(page.getByRole('status')).toContainText('Cartão criado.')
  const cartao = page.getByRole('article', { name: 'Nubank pessoal' })
  await expect(cartao).toContainText(`Gasto neste cartão em ${monthName(Number(current.slice(5)))}`)
  await expect(cartao).toContainText(brl('0,00'))

  // Sem gasto anterior, "Outra forma" vem marcada; um toque escolhe o cartão.
  await page.goto('/anotar')
  const comoPagou = page.getByRole('group', { name: 'Como pagou?' })
  await expect(comoPagou.getByRole('radio', { name: 'Outra forma', exact: true })).toBeChecked()
  await page.getByLabel('Quanto foi?').fill('120')
  await pick(page, 'Mercado')
  await pick(page, 'Nubank pessoal')
  await page.getByRole('button', { name: 'Salvar gasto', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Anotado. Seu mês já está atualizado.')
  await expect(page.locator('main')).not.toContainText('Gasto neste cartão') // RF-61

  // O cartão do último gasto já vem marcado.
  await page.goto('/anotar')
  await expect(page.getByRole('group', { name: 'Como pagou?' }).getByRole('radio', { name: 'Nubank pessoal', exact: true })).toBeChecked()

  await page.goto('/cartoes')
  await expect(page.getByRole('article', { name: 'Nubank pessoal' })).toContainText(brl('120,00'))
  await page.getByRole('article', { name: 'Nubank pessoal' }).getByRole('link', { name: 'Ver gastos', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/extrato\\?mes=${current}&cartao=`))
  const hoje = page.getByRole('region', { name: 'Hoje' })
  await expect(hoje).toContainText('Mercado')
  await expect(hoje).toContainText('Nubank pessoal')

  // Excluir o cartão: o gasto continua, com o mesmo valor, como "Cartão excluído" (Review Focus 4).
  await page.goto('/cartoes')
  await page.getByRole('link', { name: 'Editar cartão Nubank pessoal', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Nubank pessoal' })).toBeVisible()
  await page.getByRole('button', { name: 'Excluir', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Excluir o cartão "Nubank pessoal"?' }).getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Cartão excluído.')
  await expect(page.getByText('Nenhum cartão por enquanto. Adicione um para ver quanto gastou com ele em cada mês.')).toBeVisible()

  await page.goto('/extrato')
  const depois = page.getByRole('region', { name: 'Hoje' })
  await expect(depois).toContainText('Cartão excluído')
  await expect(depois).toContainText(brl('120,00'))
  await page.goto('/inicio')
  await expect(saiu(page)).toContainText(brl('120,00'))
  await page.goto('/anotar')
  await expect(page.getByRole('group', { name: 'Como pagou?' })).toHaveCount(0)
})

test('parcelado: anotar em 3x, cada mês com a sua parcela, quitar o restante', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Davi')
  await entrar(page, u.email)

  await page.goto('/anotar')
  await page.getByLabel('Quanto foi?').fill('300')
  await pick(page, 'Compras')
  await page.getByText('Mais detalhes', { exact: true }).click()
  await page.getByLabel('Uma nota, se quiser').fill('Tênis')
  await page.getByLabel('Foi parcelado').check()
  await page.getByLabel('Em quantas parcelas?').fill('3')
  await page.getByRole('button', { name: 'Salvar gasto', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Anotado. Seu mês já está atualizado.')
  await expect(saiu(page)).toContainText(brl('100,00'))
  await page.goto(`/inicio?mes=${next}`)
  await expect(saiu(page)).toContainText(brl('100,00'))

  await page.goto('/extrato')
  const hoje = page.getByRole('region', { name: 'Hoje' })
  await expect(hoje).toContainText('parcela 1 de 3')
  await hoje.getByRole('link', { name: /^Compras · Tênis/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tênis' })).toBeVisible()
  const resumo = page.getByTestId('compra-resumo')
  await expect(resumo).toContainText(`${brl('300,00')} em 3 parcelas`)
  await expect(resumo).toContainText(`Faltam 2 parcelas: ${brl('200,00')}.`)

  await page.getByRole('link', { name: 'Quitar antecipadamente', exact: true }).click()
  await expect(page.getByLabel('Quanto foi?')).toHaveValue('200,00')
  await page.getByLabel('Quanto foi?').fill('180')
  await page.getByRole('button', { name: 'Quitar parcelas', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Parcelas quitadas. Seu mês já está atualizado.')
  await expect(page.getByTestId('compra-resumo')).toContainText(`Quitada em ${dayMonthLabel(today)}.`)
  await expect(page.getByRole('region', { name: 'Parcelas' })).toContainText('Restante quitado')
  await expect(page.getByRole('link', { name: 'Quitar antecipadamente', exact: true })).toHaveCount(0)

  await page.goto('/inicio')
  await expect(saiu(page)).toContainText(brl('280,00'))
  await page.goto(`/extrato?mes=${next}`)
  await expect(page.getByText('Você ainda não registrou nenhum gasto. Quando registrar, ele aparece aqui.')).toBeVisible()
})

test('desktop: Cartões no menu lateral, gastos do cartão no Extrato e devolução', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Bia')
  const compras = await categoryOf(u.id, 'compras')
  const card = await addCard(u.id, { nickname: 'Inter', kind: 'debit', color: 'orange' })
  // Compra do mês passado em 4x: parcela 2 neste mês (até hoje), 3 e 4 futuras.
  const purchasedOn = dueDateIn(addMonths(current, -1), day)
  const { data: plan, error } = await admin
    .from('installment_plans').insert({ user_id: u.id, total_cents: 40000, installment_count: 4, purchased_on: purchasedOn }).select('id').single()
  if (error) throw error
  const { error: e2 } = await admin.from('transactions').insert(
    splitInstallments(40000, 4, purchasedOn).map((p) => ({
      user_id: u.id, kind: 'expense', amount_cents: p.amountCents, category_id: compras, note: 'Cadeira', card_id: card,
      occurred_on: p.occurredOn, installment_plan_id: plan.id, installment_number: p.number, installment_count: 4,
    })),
  )
  if (e2) throw e2
  const { data: parcela, error: e3 } = await admin
    .from('transactions').select('id').eq('installment_plan_id', plan.id).eq('installment_number', 1).single()
  if (e3) throw e3
  await entrar(page, u.email)

  // Endereço digitado de uma parcela redireciona para a compra (Review Focus 5).
  await page.goto(`/extrato/${parcela.id}`)
  await expect(page).toHaveURL(new RegExp(`/extrato/parcelas/${plan.id}$`))

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Cartões', exact: true }).click()
  await expect(page).toHaveURL(/\/cartoes$/)
  const inter = page.getByRole('article', { name: 'Inter' })
  await expect(inter).toContainText(brl('100,00'))
  await inter.getByRole('link', { name: 'Ver gastos', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Cartão' })).toContainText('Inter')
  const linha = page.getByRole('link', { name: /^Compras · Cadeira/ })
  await expect(linha).toContainText('parcela 2 de 4')
  await linha.click()

  await expect(page.getByRole('heading', { level: 1, name: 'Cadeira' })).toBeVisible()
  await expect(page.getByTestId('compra-resumo')).toContainText(`Faltam 2 parcelas: ${brl('200,00')}.`)
  await page.getByRole('button', { name: 'Cancelar por devolução', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Cancelar as parcelas por devolução?' }).getByRole('button', { name: 'Cancelar parcelas', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Parcelas canceladas. Seu mês já está atualizado.')
  await expect(page.getByTestId('compra-resumo')).toContainText(`Devolvida em ${dayMonthLabel(today)}.`)
  await expect(page.getByRole('region', { name: 'Parcelas' }).getByRole('listitem')).toHaveCount(2)

  await page.goto(`/cartoes?mes=${next}`)
  await expect(page.getByRole('article', { name: 'Inter' })).toContainText(brl('0,00'))
  await page.goto('/cartoes')
  await expect(page.getByRole('article', { name: 'Inter' })).toContainText(brl('100,00'))
})
