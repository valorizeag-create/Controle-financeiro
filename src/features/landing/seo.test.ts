import { readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import { PRIVATE_PREFIXES, robotsFor, sitemapFor } from './seo'

const SITE = 'https://iris.exemplo'
const blocked = (path: string) => PRIVATE_PREFIXES.some((p) => path.startsWith(p))
const dirs = (group: string) => readdirSync(`src/app/${group}`, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `/${d.name}`)

test('robots: toda área do app e do onboarding fica fora; as páginas públicas, dentro', () => {
  for (const path of [...dirs('(app)'), ...dirs('(onboarding)'), '/convite/abc', '/nova-senha', '/api/jobs/notificacoes', '/auth/callback']) {
    expect(blocked(path), path).toBe(true)
  }
  for (const path of ['/', '/entrar', '/criar-cadastro', '/termos', '/privacidade']) expect(blocked(path), path).toBe(false)
  expect(robotsFor(SITE)).toEqual({ rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] }, sitemap: `${SITE}/sitemap.xml` })
})

test('sitemap: só a landing enquanto os textos jurídicos são rascunho; Termos e Privacidade só quando prontos', () => {
  expect(sitemapFor(SITE, false).map((e) => e.url)).toEqual([`${SITE}/`])
  expect(sitemapFor(SITE, true).map((e) => e.url)).toEqual([`${SITE}/`, `${SITE}/termos`, `${SITE}/privacidade`])
})

test('robots e sitemap não carregam código de convite, token nem caminho de dados', () => {
  const text = JSON.stringify([robotsFor(SITE), sitemapFor(SITE, true)])
  expect(text).not.toMatch(/token|code=|[A-Za-z0-9_-]{32}|\?/)
})
