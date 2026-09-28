import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addMonths, monthOf, todayInSaoPaulo } from '../../src/domain/dates'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})
const password = 'senha-forte-123'
const created: string[] = []
// formatBRL separa "R$" do número com espaço não separável.
const NBSP = String.fromCharCode(0xa0)
// Cada worker (celular e desktop rodam em paralelo) precisa de um prefixo só
// seu: senão a varredura de limpeza de um worker pode apagar usuários que o
// outro ainda está usando. TEST_PARALLEL_INDEX é único entre workers
// concorrentes; o id de execução evita colisão entre execuções.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const WORKER = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0'
const RUN_PREFIX = `e2e-p2-w${WORKER}-${RUN_ID}-`

async function makeUser(name: string, opts: { onboarded: boolean }): Promise<{ id: string; email: string }> {
  const email = `${RUN_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
  if (error) throw error
  created.push(data.user.id)
  if (opts.onboarded) {
    const { error: e2 } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', data.user.id)
    if (e2) throw e2
  }
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

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test.afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id)

  // Se este worker reiniciar depois de uma falha, `created` (em memória) se
  // perde e os usuários criados até então ficariam órfãos. Varre todas as
  // páginas de listUsers e apaga qualquer usuário com o prefixo exato deste
  // worker/execução (RUN_PREFIX já inclui o worker e um id de execução), mesmo
  // que já esteja fora de `created`. Nunca um prefixo genérico: outro worker
  // rodando em paralelo pode ter usuários seus ainda em uso.
  const known = new Set(created)
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      if (u.email?.startsWith(RUN_PREFIX) && !known.has(u.id)) {
        await admin.auth.admin.deleteUser(u.id)
      }
    }
    if (data.users.length < 1000) break
    page += 1
  }
})

test('onboarding: quem parou no meio volta a ele; quem concluiu não vê de novo', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Davi', { onboarded: false })
  await entrar(page, u.email)

  await expect(page).toHaveURL(/\/boas-vindas$/)
  await expect(page.getByRole('heading', { name: 'Aqui, tudo começa com um gasto.' })).toBeVisible()
  await page.getByRole('link', { name: 'Próximo' }).click()
  await expect(page.getByRole('heading', { name: 'Veja para onde seu dinheiro vai.' })).toBeVisible()

  // Fechou o app no passo 2: qualquer tela do app leva de volta ao onboarding (Review Focus 3).
  await page.goto('/inicio')
  await expect(page).toHaveURL(/\/boas-vindas$/)

  await page.goto('/boas-vindas?passo=3')
  await expect(page.getByRole('heading', { name: 'No seu ritmo.' })).toBeVisible()
  await page.getByRole('link', { name: 'Começar' }).click()
  await expect(page.getByRole('heading', { name: 'Quanto você tem hoje?' })).toBeVisible()
  await page.getByLabel('Somando banco, carteira e dinheiro guardado').fill('6.000')
  await page.getByRole('button', { name: 'Salvar e continuar' }).click()

  await expect(page.getByRole('heading', { name: 'Que tal anotar seu primeiro gasto?' })).toBeVisible()
  await page.getByRole('link', { name: 'Depois' }).click()
  await expect(page.getByRole('heading', { name: 'Oi, Davi.' })).toBeVisible()
  await expect(page.getByText('Saldo total', { exact: true }).locator('..')).toContainText(`R$${NBSP}6.000,00`)

  await page.goto('/boas-vindas')
  await expect(page).toHaveURL(/\/inicio$/)
})

test('onboarding pulável: Pular leva ao primeiro gasto e "Anotar agora" abre o Anotar', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Eva', { onboarded: false })
  await entrar(page, u.email)
  await page.getByRole('link', { name: 'Pular' }).click()
  await expect(page.getByRole('heading', { name: 'Quanto você tem hoje?' })).toBeVisible()
  await page.getByRole('button', { name: 'Pular' }).click()
  await expect(page.getByRole('heading', { name: 'Que tal anotar seu primeiro gasto?' })).toBeVisible()
  await page.getByRole('link', { name: 'Anotar agora' }).click()
  await expect(page.getByLabel('Quanto foi?')).toBeVisible()
})

test('extrato: busca, filtro, editar (inclusive mudando de mês) e excluir', async ({ page }) => {
  const u = await makeUser('Gil', { onboarded: true })
  const today = todayInSaoPaulo()
  const prevMonth = addMonths(monthOf(today), -1)
  const mercado = await categoryOf(u.id, 'mercado')
  const saude = await categoryOf(u.id, 'saude')
  await addTx(u.id, { kind: 'expense', amount_cents: 14230, category_id: mercado, note: 'feira', payment_method: 'pix', occurred_on: today })
  await addTx(u.id, { kind: 'expense', amount_cents: 8100, category_id: saude, occurred_on: today })
  await addTx(u.id, { kind: 'income', amount_cents: 500000, source: 'Salário', occurred_on: today })

  await entrar(page, u.email)
  await expect(page.getByRole('heading', { name: 'Oi, Gil.' })).toBeVisible()
  await page.getByRole('link', { name: 'Extrato', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tudo o que entrou e saiu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible()

  const search = page.getByRole('searchbox', { name: 'Buscar' })
  await search.fill('saude')
  await search.press('Enter')
  await expect(page.getByRole('link', { name: /Saúde.*81,00/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toHaveCount(0)

  await page.getByRole('searchbox', { name: 'Buscar' }).fill('142,3')
  await page.getByRole('searchbox', { name: 'Buscar' }).press('Enter')
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Saúde.*81,00/ })).toHaveCount(0)

  await page.getByRole('searchbox', { name: 'Buscar' }).fill('xyz')
  await page.getByRole('searchbox', { name: 'Buscar' }).press('Enter')
  await expect(page.getByText('Nada encontrado para "xyz". Tente outra palavra ou um valor.')).toBeVisible()

  await page.goto('/extrato')
  await page.getByRole('link', { name: 'Entradas' }).click()
  await expect(page.getByRole('link', { name: /Salário/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toHaveCount(0)

  await page.goto('/extrato')
  await page.getByRole('link', { name: /Mercado · feira/ }).click()
  await expect(page.getByRole('heading', { name: 'Editar gasto' })).toBeVisible()
  await expect(page.getByLabel('Quanto foi?')).toHaveValue('142,30')
  await page.getByLabel('Quanto foi?').fill('150')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toContainText(`R$${NBSP}150,00`)

  // Review Focus 2: a data vai para o mês anterior; o registro aparece lá e sai do mês atual.
  await page.getByRole('link', { name: /Mercado · feira/ }).click()
  await page.getByRole('radio', { name: 'Outro dia' }).check({ force: true })
  await page.getByLabel('Dia', { exact: true }).fill(`${prevMonth}-15`)
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page).toHaveURL(new RegExp(`/extrato\\?mes=${prevMonth}$`))
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toBeVisible()
  await page.goto('/extrato')
  await expect(page.getByRole('link', { name: /Mercado · feira/ })).toHaveCount(0)

  await page.getByRole('link', { name: /Saúde.*81,00/ }).click()
  await page.getByRole('button', { name: 'Excluir' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Excluir este gasto?' })
  await expect(dialog).toContainText('Seu mês será recalculado.')
  await dialog.getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByRole('status')).toHaveText('Excluído. Seu mês já está atualizado.')
  await expect(page.getByRole('link', { name: /Saúde.*81,00/ })).toHaveCount(0)
})

test('fechar o Anotar com algo digitado pergunta antes de descartar', async ({ page }) => {
  const u = await makeUser('Hugo', { onboarded: true })
  await entrar(page, u.email)
  await expect(page.getByRole('heading', { name: 'Oi, Hugo.' })).toBeVisible()
  await page.goto('/anotar')
  await page.getByLabel('Quanto foi?').fill('25')
  await page.getByRole('link', { name: 'Fechar' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Descartar este registro?' })
  await expect(dialog).toContainText('O que você digitou não será salvo.')
  await dialog.getByRole('button', { name: 'Continuar editando' }).click()
  await expect(page.getByLabel('Quanto foi?')).toHaveValue('25')
  await page.getByRole('link', { name: 'Fechar' }).click()
  await page.getByRole('alertdialog').getByRole('link', { name: 'Descartar' }).click()
  await expect(page).toHaveURL(/\/inicio$/)
})

test('categorias: criar, nome repetido, renomear e excluir levando os gastos para Outros', async ({ page }) => {
  const u = await makeUser('Iara', { onboarded: true })
  await entrar(page, u.email)
  await expect(page.getByRole('heading', { name: 'Oi, Iara.' })).toBeVisible()

  await page.goto('/categorias')
  await expect(page.getByRole('heading', { name: 'Para onde seu dinheiro vai' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Outros' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Criar categoria' }).click()
  await page.getByLabel('Nome').fill('Pet')
  await page.getByRole('button', { name: 'Criar categoria' }).click()
  await expect(page.getByRole('status')).toHaveText('Categoria criada.')

  // Review Focus 4: outra grafia do mesmo nome.
  await page.getByRole('link', { name: 'Criar categoria' }).click()
  await page.getByLabel('Nome').fill('  pet ')
  await page.getByRole('button', { name: 'Criar categoria' }).click()
  await expect(page.getByText('Você já tem uma categoria com esse nome.')).toBeVisible()
  await expect(page.getByLabel('Nome')).toHaveValue('  pet ')

  await page.goto('/anotar')
  await page.getByLabel('Quanto foi?').fill('30')
  await page.getByRole('radio', { name: 'Pet' }).check({ force: true })
  await page.getByRole('button', { name: 'Salvar gasto' }).click()
  await expect(page.getByRole('status')).toHaveText('Anotado. Seu mês já está atualizado.')

  await page.goto('/categorias')
  await page.getByRole('link', { name: 'Pet' }).click()
  await page.getByLabel('Nome').fill('Bichos')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')

  await page.getByRole('link', { name: 'Bichos' }).click()
  await page.getByRole('button', { name: 'Excluir' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Excluir a categoria "Bichos"?' })
  await expect(dialog).toContainText('Os gastos desta categoria vão para "Outros". Nada será apagado.')
  await dialog.getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByRole('status')).toHaveText('Categoria excluída.')
  await expect(page.getByRole('link', { name: 'Bichos' })).toHaveCount(0)

  await page.goto('/extrato')
  await expect(page.getByRole('link', { name: /Outros.*30,00/ })).toContainText(`R$${NBSP}30,00`)
})

test('configurações: nome, saldo inicial e sair com confirmação', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'Usa a barra inferior (Mais).')
  const u = await makeUser('Joana', { onboarded: true })
  await entrar(page, u.email)
  await expect(page.getByRole('heading', { name: 'Oi, Joana.' })).toBeVisible()

  await page.getByRole('link', { name: 'Mais' }).click()
  await page.getByRole('link', { name: 'Configurações' }).click()
  await expect(page.getByText(u.email)).toBeVisible()

  await page.getByRole('link', { name: /Nome/ }).click()
  await page.getByLabel('Como podemos te chamar?').fill('Jo')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')

  await page.getByRole('link', { name: /Quanto você tinha ao começar/ }).click()
  await page.getByLabel('Somando banco, carteira e dinheiro guardado').fill('1.500,50')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')

  await page.goto('/inicio')
  await expect(page.getByRole('heading', { name: 'Oi, Jo.' })).toBeVisible()
  await expect(page.getByText('Saldo total', { exact: true }).locator('..')).toContainText(`R$${NBSP}1.500,50`)

  await page.goto('/mais')
  await page.getByRole('button', { name: 'Sair da Íris' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Sair da Íris?' })
  await expect(dialog).toContainText('Seus dados continuam salvos.')
  await dialog.getByRole('button', { name: 'Ficar' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sair da Íris' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/entrar$/)
})
