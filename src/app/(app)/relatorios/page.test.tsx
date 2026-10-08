// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ empty: false, noCategories: false }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ usePathname: () => '/relatorios', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/features/registro/queries', () => ({ loadLedger: async () => ({ profile: {}, categories: [], transactions: [], goalMovements: [] }) }))
vi.mock('@/features/relatorios/view-model', () => ({
  buildRelatorios: () => ({ empty: h.empty, summary: {}, changes: [], chart: [{}], months: [], categories: h.noCategories ? [] : [{ name: 'Mercado', cents: 100, share: 1 }] }),
}))
vi.mock('@/features/relatorios/period-filter', () => ({ PeriodFilter: () => <nav aria-label="Período" /> }))
vi.mock('@/features/relatorios/report-sections', () => ({
  WhatChanged: () => <h2>O que mudou</h2>,
  MonthByMonth: () => <h2>Mês a mês</h2>,
}))
vi.mock('@/features/relatorios/in-out-chart', () => ({ InOutChart: () => <h2>Entrou e saiu</h2> }))
vi.mock('@/features/seu-mes/categories-card', () => ({ CategoriesCard: () => <h2>Para onde seu dinheiro vai</h2> }))

const { default: RelatoriosPage } = await import('./page')
const show = async () => render(await RelatoriosPage({ searchParams: Promise.resolve({}) }))
const column = (name: string) => screen.getByRole('heading', { name }).closest('[data-column]')?.getAttribute('data-column')

afterEach(() => { cleanup(); h.empty = false; h.noCategories = false })

test('desktop: relatórios à esquerda, categorias à direita; a ordem do DOM continua a do celular', async () => {
  const { container } = await show()
  expect(['O que mudou', 'Entrou e saiu', 'Mês a mês'].map(column)).toEqual(['main', 'main', 'main'])
  expect(column('Para onde seu dinheiro vai')).toBe('aside')
  const order = screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)
  expect(order).toEqual(['O que mudou', 'Entrou e saiu', 'Mês a mês', 'Para onde seu dinheiro vai'])
  expect(container.querySelector('main')?.className).toContain('lg:max-w-[1180px]')
})

test('sem registros: uma coluna só', async () => {
  h.empty = true
  const { container } = await show()
  expect(container.querySelector('[data-columns]')).toBeNull()
})

test('com registros mas sem categorias: uma coluna, sem lateral vazia', async () => {
  h.noCategories = true
  const { container } = await show()
  expect(container.querySelector('[data-columns]')).toBeNull()
  expect(container.querySelector('[data-column="aside"]')).toBeNull()
  expect(screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)).toEqual(['O que mudou', 'Entrou e saiu', 'Mês a mês'])
})
