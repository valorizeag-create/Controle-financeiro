// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'

vi.mock('server-only', () => ({}))
vi.mock('@/features/registro/queries', () => ({
  loadLedger: async () => ({ categories: [], transactions: [], goalMovements: [] }),
}))
vi.mock('@/features/cartoes/queries', () => ({ loadCards: async () => [] }))
vi.mock('@/features/metas/queries', () => ({ loadGoals: async () => [], loadFamilyGoalLabels: async () => [] }))
vi.mock('@/features/familia/queries', () => ({ loadFamilySummary: async () => null }))
vi.mock('@/features/extrato/view-model', () => ({
  parseExtratoFilters: () => ({}),
  buildExtrato: () => ({ filters: { month: '2026-10' }, monthLabel: 'outubro', categoryName: null, cardName: null }),
  extratoParams: () => ({}),
}))
vi.mock('@/features/extrato/filters-bar', () => ({ FiltersBar: () => <nav aria-label="Filtros" /> }))
vi.mock('@/features/extrato/extrato-list', () => ({ ExtratoList: () => <h2>Lista</h2> }))
vi.mock('@/features/seu-mes/month-nav', () => ({ MonthNav: () => <nav aria-label="Mês" /> }))

const { default: ExtratoPage } = await import('./page')
const show = async () => render(await ExtratoPage({ searchParams: Promise.resolve({}) }))
afterEach(() => cleanup())

test('desktop: filtros à direita, lista à esquerda; filtros antes da lista no DOM (como no celular)', async () => {
  const { container } = await show()
  const root = container.querySelector('[data-columns]') as HTMLElement
  expect([...root.children].map((c) => c.getAttribute('data-column'))).toEqual(['aside', 'main'])
  expect(within(root.children[0] as HTMLElement).getByRole('navigation', { name: 'Filtros' })).toBeTruthy()
  expect(within(root.children[1] as HTMLElement).getByRole('heading', { name: 'Lista' })).toBeTruthy()
  expect(container.querySelectorAll('main')).toHaveLength(1)
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[1180px]')
})
