// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

const h = vi.hoisted(() => ({ hasPassword: true }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ env: { vapidPublicKey: null } }))
vi.mock('@/features/perfil/queries', () => ({
  loadProfile: async () => ({ displayName: 'Camila', email: 'camila@teste.iris.dev', initialBalanceCents: 0, onboardedAt: null, categoriesCount: 10 }),
}))
vi.mock('@/features/notificacoes/queries', () => ({ loadNotificationPrefs: async () => ({}) }))
vi.mock('@/features/notificacoes/reminders-section', () => ({ RemindersSection: () => null }))
vi.mock('@/features/familia/queries', () => ({ loadFamilySummaryOrNull: async () => null }))
vi.mock('@/features/cadastro/queries', () => ({ loadSignIn: async () => ({ hasPassword: h.hasPassword, sessionRecent: true }) }))

const { default: ConfiguracoesPage } = await import('./page')
const show = async () => render(await ConfiguracoesPage({ searchParams: Promise.resolve({}) }))

afterEach(() => {
  cleanup()
  h.hasPassword = true
})

test('"Seus dados" é a última seção: baixar, termos, privacidade e, por último, excluir', async () => {
  await show()
  const sections = screen.getAllByRole('region').map((s) => within(s).getByRole('heading', { level: 2 }).textContent)
  expect(sections[sections.length - 1]).toBe('Seus dados')
  const links = within(screen.getByRole('region', { name: 'Seus dados' })).getAllByRole('link')
  expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
    ['Baixar meus dados', '/configuracoes/dados'],
    ['Termos de uso', '/termos'],
    ['Política de privacidade', '/privacidade'],
    ['Excluir meu cadastro', '/configuracoes/excluir'],
  ])
})

test('cadastro com senha: o e-mail leva à troca', async () => {
  await show()
  const link = within(screen.getByRole('region', { name: 'Seu cadastro' })).getByRole('link', { name: /camila@teste\.iris\.dev/ })
  expect(link.getAttribute('href')).toBe('/configuracoes/e-mail')
})

test('cadastro sem senha: e-mail só para leitura', async () => {
  h.hasPassword = false
  await show()
  const region = screen.getByRole('region', { name: 'Seu cadastro' })
  expect(within(region).getByText('camila@teste.iris.dev')).toBeTruthy()
  expect(within(region).queryByRole('link', { name: /camila@teste\.iris\.dev/ })).toBeNull()
})

test('desktop: seções em duas colunas de jornal, sem quebrar uma seção ao meio, na ordem do celular', async () => {
  const { container } = await show()
  const wrap = container.querySelector('[data-settings-columns]') as HTMLElement
  expect(wrap.className).toContain('lg:columns-2')
  for (const region of within(wrap).getAllByRole('region')) expect((region.closest('[data-settings-columns] > *') as HTMLElement).className).toContain('break-inside-avoid')
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[1180px]')
  expect(container.querySelectorAll('main')).toHaveLength(1)
  // a ordem do DOM é a do celular: cadastro, dinheiro, app, dados
  const titles = within(wrap).getAllByRole('heading', { level: 2 }).map((x) => x.textContent)
  expect(titles).toEqual(['Seu cadastro', 'Seu dinheiro', 'App', 'Seus dados'])
})
