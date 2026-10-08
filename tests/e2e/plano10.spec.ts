import { expect, test } from '@playwright/test'
import { entrar, expectNoHorizontalScroll, seedBill, seedBudget, seedExpense, today, users } from './apoio'

const { makeUser, cleanup } = users('p10')
test.afterAll(cleanup)
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')

test('@publico visitante: landing com as seções da copy, CTAs para o cadastro e nada de "baixe o app"', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Seu dinheiro, finalmente à vista.', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(8)
  await expect(page.getByRole('link', { name: 'Começar a ver meu mês', exact: true })).toHaveCount(3)
  await expect(page.getByText('Seus dados são seus.')).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toMatch(/baixe|download|app store|google play/i)
  await page.getByRole('link', { name: 'Ver como funciona', exact: true }).click()
  await expect(page).toHaveURL(/#como-funciona$/)
  await page.getByRole('link', { name: 'Começar a ver meu mês', exact: true }).first().click()
  await expect(page).toHaveURL(/\/criar-cadastro$/)
})

test('@publico primeiro Tab: "Pular para o conteúdo", e Enter leva o foco ao conteúdo', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo', exact: true })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#conteudo')).toBeFocused()
})

test('@publico SEO: robots, sitemap, canônico e Open Graph, sem script de terceiros', async ({ page, request }) => {
  const robots = await request.get('/robots.txt', { maxRedirects: 0 })
  expect(robots.status()).toBe(200)
  const txt = await robots.text()
  expect(txt).toContain('Disallow: /inicio')
  expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`)
  const sitemap = await request.get('/sitemap.xml', { maxRedirects: 0 })
  expect(sitemap.status()).toBe(200)
  expect(await sitemap.text()).toContain(`<loc>${SITE}/</loc>`)
  expect(await sitemap.text()).not.toContain('/termos') // textos jurídicos em rascunho
  const og = await request.get('/opengraph-image.png', { maxRedirects: 0 })
  expect(og.status()).toBe(200)
  await page.goto('/')
  await expect(page).toHaveTitle('Íris — Veja para onde seu dinheiro vai')
  // O Next escreve a raiz sem a barra final; normalizar pela URL compara o mesmo endereço.
  expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).href).toBe(`${SITE}/`)
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(new RegExp(`^${SITE}/opengraph-image\\.png`))
  const scripts = await page.locator('script[src]').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src))
  for (const src of scripts) expect(new URL(src).origin, src).toBe(new URL(page.url()).origin)
})

test('quem entrou e abre / vai para o Seu mês', async ({ page }) => {
  const u = await makeUser('Davi')
  await entrar(page, u.email)
  await page.goto('/')
  await expect(page).toHaveURL(/\/inicio$/)
})

test('desktop: duas colunas a 1440 px, uma coluna a 800 px, sem rolagem horizontal', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const u = await makeUser('Elisa')
  await seedExpense(u.id, 'mercado', 89000, 'Feira')
  await seedBudget(u.id, 'mercado', 100000, today.slice(0, 7))
  await seedBill(u.id, 'Internet', 12000, 28)
  await entrar(page, u.email)
  // Família fica de fora: sem família a tela é de uma coluna (conferido em jsdom, Task 8).
  for (const path of ['/relatorios', '/planejamento', '/contas', '/extrato']) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(path)
    const main = page.locator('[data-column="main"]').first()
    const aside = page.locator('[data-column="aside"]').first()
    await expect(aside, path).toBeVisible()
    const [m, a] = [await main.boundingBox(), await aside.boundingBox()]
    expect(a!.x, `${path}: lateral à direita`).toBeGreaterThan(m!.x + m!.width - 1)
    await page.setViewportSize({ width: 800, height: 1000 })
    const [m2, a2] = [await main.boundingBox(), await aside.boundingBox()]
    expect(Math.abs(a2!.x - m2!.x), `${path}: uma coluna a 800 px`).toBeLessThan(2)
    await expectNoHorizontalScroll(page, `800 ${path}`)
  }
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/inicio')
  await expectNoHorizontalScroll(page, '1024 /inicio')
  await page.goto('/configuracoes')
  expect(await page.locator('[data-settings-columns]').evaluate((el) => getComputedStyle(el).columnCount)).toBe('2')
})

test('celular: 375 px sem rolagem horizontal nas telas que mudaram', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular')
  const u = await makeUser('Fábio')
  await seedExpense(u.id, 'mercado', 89000, 'Feira')
  await entrar(page, u.email)
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of ['/inicio', '/relatorios', '/planejamento', '/contas', '/extrato', '/metas', '/familia', '/configuracoes', '/configuracoes/instalar', '/cartoes']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expectNoHorizontalScroll(page, `375 ${path}`)
  }
})
