import { expect, test } from '@playwright/test'
import { entrar, expectNoA11yViolations, expectNoHorizontalScroll, seedBill, seedBudget, seedExpense, seedGoal, today, users } from './apoio'

const { makeUser, cleanup } = users('a11y')
test.afterAll(cleanup)

// Não precisam de banco: rodam também sem Docker.
const PUBLIC = ['/', '/entrar', '/criar-cadastro', '/recuperar-senha', '/termos', '/privacidade', '/cadastro-excluido']

test('@publico páginas públicas: sem violações WCAG A/AA e sem rolagem horizontal', async ({ page }) => {
  for (const path of PUBLIC) {
    await page.goto(path)
    await expectNoA11yViolations(page, path)
    await expectNoHorizontalScroll(page, path)
  }
})

test('@publico 375 px: a landing e o acesso não rolam na horizontal', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of ['/', '/entrar', '/criar-cadastro']) {
    await page.goto(path)
    await expectNoHorizontalScroll(page, `375 ${path}`)
  }
})

const APP = ['/inicio', '/extrato', '/anotar', '/contas', '/metas', '/planejamento', '/relatorios', '/familia', '/categorias', '/cartoes', '/configuracoes', '/configuracoes/instalar', '/configuracoes/dados']

test('telas do app com dados: sem violações WCAG A/AA e sem rolagem horizontal', async ({ page }, info) => {
  const u = await makeUser('Camila')
  await seedExpense(u.id, 'mercado', 89000, 'Feira')
  await seedBudget(u.id, 'mercado', 100000, today.slice(0, 7))
  await seedGoal(u.id, 'Viagem', 400000)
  await seedBill(u.id, 'Internet', 12000, 28)
  await entrar(page, u.email)
  const paths = info.project.name === 'celular' ? [...APP, '/mais'] : APP
  for (const path of paths) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expectNoA11yViolations(page, path)
    await expectNoHorizontalScroll(page, path)
  }
})
