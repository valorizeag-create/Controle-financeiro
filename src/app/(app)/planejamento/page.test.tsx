// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

const h = vi.hoisted(() => ({ empty: false }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ usePathname: () => '/planejamento', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/features/registro/queries', () => ({ loadLedger: async () => ({ categories: [], transactions: [] }) }))
vi.mock('@/features/planejamento/queries', () => ({ loadBudgets: async () => [] }))
vi.mock('@/features/planejamento/actions', () => ({ repeatPreviousBudgets: vi.fn() }))
vi.mock('@/features/planejamento/view-model', () => ({
  buildPlanejamento: () => ({
    empty: h.empty,
    heroLabel: 'Planejado para outubro',
    totalCents: 100000,
    withinText: 'Você está dentro do planejado em 1 de 1 categorias.',
    lines: [],
    editHref: '/planejamento/editar',
    repeatFrom: null,
  }),
}))
vi.mock('@/features/planejamento/budget-lines', () => ({ BudgetLines: () => <ul aria-label="Linhas" /> }))
vi.mock('@/features/seu-mes/month-nav', () => ({ MonthNav: () => <nav aria-label="Mês" /> }))

const { default: PlanejamentoPage } = await import('./page')
const show = async () => render(await PlanejamentoPage({ searchParams: Promise.resolve({}) }))

afterEach(() => { cleanup(); h.empty = false })

test('desktop: resumo à direita em cima, linhas à esquerda, ajuda à direita embaixo; DOM na ordem do celular', async () => {
  const { container } = await show()
  const root = container.querySelector('[data-columns]') as HTMLElement
  const parts = [...root.children].map((c) => [c.getAttribute('data-column'), c.getAttribute('data-row')])
  expect(parts).toEqual([['aside', '1'], ['main', null], ['aside', '2']])
  expect(within(root.children[0] as HTMLElement).getByText('Planejado para outubro')).toBeTruthy()
  expect(within(root.children[1] as HTMLElement).getByRole('link', { name: 'Planejar outra categoria' })).toBeTruthy()
  expect((root.children[2] as HTMLElement).textContent).toContain('O que é "Planejado"?')
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[1180px]')
})

test('sem planejado: uma coluna só, com "Planejar meu mês"', async () => {
  h.empty = true
  const { container } = await show()
  expect(container.querySelector('[data-columns]')).toBeNull()
  expect(screen.getByRole('link', { name: 'Planejar meu mês' })).toBeTruthy()
  expect(container.textContent).toContain('O que é "Planejado"?')
})
