import { expect, test, type Page } from '@playwright/test'
import { entrar, expectNoHorizontalScroll, today, users } from './apoio'

const { makeUser, cleanup } = users('imp')
test.afterAll(cleanup)
const NBSP = String.fromCharCode(0xa0)

// Datas no mês corrente (hoje), para os registros caírem no "Seu mês".
const [yyyy, mm, dd] = today.split('-')
const CSV = [
  'Data;Descrição;Valor',
  `${dd}/${mm}/${yyyy};UBER TRIP;-25,00`,
  `${dd}/${mm}/${yyyy};ZXQ COMERCIO LTDA;-120,00`,
  `${dd}/${mm}/${yyyy};PIX RECEBIDO MARIA;1000,00`,
].join('\n')

async function escolherArquivo(page: Page): Promise<void> {
  await page.goto('/extrato/importar')
  await page.locator('input[type="file"]').setInputFiles({ name: 'extrato.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'latin1') })
  await page.getByRole('button', { name: 'Ver o que a Íris encontrou', exact: true }).click()
}

test('importar extrato: CSV, escolher a categoria, anotar e ver o mês; reimportar não duplica', async ({ page }, info) => {
  test.setTimeout(180_000) // rotas compilando a frio no servidor de desenvolvimento
  const u = await makeUser('Fabi')
  await entrar(page, u.email)

  await escolherArquivo(page)
  await expect(page.getByRole('heading', { name: 'Escolha a categoria', exact: true })).toBeVisible()
  if (info.project.name === 'celular') {
    await page.setViewportSize({ width: 375, height: 812 })
    await expectNoHorizontalScroll(page, '375 revisão')
  }
  await page.locator('li[data-sem-categoria="true"] select').selectOption({ label: 'Mercado' })
  await page.getByRole('button', { name: 'Anotar 3 registros', exact: true }).click()

  await expect(page).toHaveURL(/\/inicio/)
  await expect(page.getByRole('status')).toHaveText('3 registros anotados.')
  // +1.000,00 de entrada, −25,00 e −120,00 de gastos.
  await expect(page.getByTestId('disponivel')).toHaveText(`R$${NBSP}855,00`)

  await escolherArquivo(page)
  await expect(page.getByText('3 linhas já importadas antes.', { exact: true })).toBeVisible()
  await expect(page.getByText('Nenhum registro neste período.', { exact: true })).toBeVisible()
})
