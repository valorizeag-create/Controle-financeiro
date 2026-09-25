// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { FiltersBar } from './filters-bar'

// Alvo de toque mínimo de 44px (fix round 1).
const MIN_TARGET = ['h-11']

afterEach(() => cleanup())

const MERCADO = '11111111-1111-4111-8111-111111111111'
const categories = [
  { id: MERCADO, name: 'Mercado', defaultKey: 'mercado' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Outros', defaultKey: 'outros' },
]

test('busca envia para /extrato mantendo mês e filtros', () => {
  render(<FiltersBar filters={{ month: '2026-09', kind: 'income', categoryId: null, q: 'sal' }} categories={categories} categoryName={null} />)
  const search = screen.getByRole('searchbox', { name: 'Buscar' })
  expect(search.getAttribute('placeholder')).toBe('Buscar por nome, valor ou categoria')
  expect((search as HTMLInputElement).value).toBe('sal')
  const form = screen.getByRole('search')
  expect(form.getAttribute('action')).toBe('/extrato')
  expect((form.querySelector('input[name="mes"]') as HTMLInputElement).value).toBe('2026-09')
  expect((form.querySelector('input[name="tipo"]') as HTMLInputElement).value).toBe('entradas')
})

test('Entradas e Gastos alternam; o ativo aparece marcado e desmarca ao tocar de novo', () => {
  render(<FiltersBar filters={{ month: '2026-09', kind: 'income', categoryId: null, q: '' }} categories={categories} categoryName={null} />)
  const entradas = screen.getByRole('link', { name: 'Entradas' })
  expect(entradas.getAttribute('aria-current')).toBe('true')
  expect(entradas.getAttribute('href')).toBe('/extrato?mes=2026-09')
  expect(screen.getByRole('link', { name: 'Gastos' }).getAttribute('href')).toBe('/extrato?mes=2026-09&tipo=gastos')
})

test('chips (Entradas, Gastos, Categoria) têm alvo de toque de ao menos 44px (fix round 1)', () => {
  render(<FiltersBar filters={{ month: '2026-09', kind: null, categoryId: null, q: '' }} categories={categories} categoryName={null} />)
  for (const cls of MIN_TARGET) {
    expect(screen.getByRole('link', { name: 'Entradas' }).className).toContain(cls)
    expect(screen.getByRole('link', { name: 'Gastos' }).className).toContain(cls)
    expect(screen.getByRole('group', { name: 'Categoria' }).querySelector('summary')?.className).toContain(cls)
  }
})

test('Categoria abre a lista; escolher filtra, escolher de novo limpa', () => {
  render(<FiltersBar filters={{ month: '2026-09', kind: 'expense', categoryId: MERCADO, q: '' }} categories={categories} categoryName="Mercado" />)
  const group = screen.getByRole('group', { name: 'Categoria' })
  expect(group.querySelector('summary')?.textContent).toBe('Mercado')
  const mercado = within(group).getByRole('link', { name: 'Mercado' })
  expect(mercado.getAttribute('aria-current')).toBe('true')
  expect(mercado.getAttribute('href')).toBe('/extrato?mes=2026-09')
  expect(within(group).getByRole('link', { name: 'Outros' }).getAttribute('href')).toBe('/extrato?mes=2026-09&categoria=33333333-3333-4333-8333-333333333333')
})

test('o menu de categoria fecha depois de escolher (fix round 1)', () => {
  const { rerender } = render(<FiltersBar filters={{ month: '2026-09', kind: 'expense', categoryId: null, q: '' }} categories={categories} categoryName={null} />)
  const details = () => screen.getByRole('group', { name: 'Categoria' }) as HTMLDetailsElement
  details().open = true
  expect(details().open).toBe(true)
  // Escolher uma categoria troca `categoryId`, o que remonta o <details> (key muda) fechado.
  rerender(<FiltersBar filters={{ month: '2026-09', kind: 'expense', categoryId: MERCADO, q: '' }} categories={categories} categoryName="Mercado" />)
  expect(details().open).toBe(false)
})
