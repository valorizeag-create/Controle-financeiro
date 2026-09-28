// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ExtratoList } from './extrato-list'
import type { ExtratoView } from './view-model'

afterEach(() => cleanup())

// formatBRL separa "R$" do número com espaço não separável.
const NBSP = String.fromCharCode(0xa0)

const base: ExtratoView = {
  filters: { month: '2026-09', kind: null, categoryId: null, cardId: null, q: '' },
  monthLabel: 'setembro de 2026',
  groups: [],
  empty: null,
  categoryName: null,
  cardName: null,
}

test('lista agrupada por dia; cada registro abre a edição', () => {
  render(
    <ExtratoList
      view={{
        ...base,
        groups: [
          { date: '2026-09-22', label: 'Hoje', rows: [{ id: 't1', kind: 'expense', title: 'Mercado · feira', subtitle: 'Pix', cents: 14230, href: '/extrato/t1', badge: null }] },
          { date: '2026-09-05', label: '5 de setembro', rows: [{ id: 't4', kind: 'income', title: 'Salário', subtitle: null, cents: 500000, href: '/extrato/t4', badge: null }] },
        ],
      }}
    />,
  )
  const hoje = screen.getByRole('region', { name: 'Hoje' })
  const gasto = within(hoje).getByRole('link', { name: /Mercado · feira/ })
  expect(gasto.getAttribute('href')).toBe('/extrato/t1')
  expect(gasto.textContent).toContain('Pix')
  expect(gasto.textContent).toContain(`− R$${NBSP}142,30`)
  const entrada = within(screen.getByRole('region', { name: '5 de setembro' })).getByRole('link', { name: /Salário/ })
  expect(entrada.textContent).toContain(`+ R$${NBSP}5.000,00`)
})

test('sem registros no mês: convite para anotar', () => {
  render(<ExtratoList view={{ ...base, empty: 'no-records' }} />)
  expect(screen.getByText('Você ainda não registrou nenhum gasto. Quando registrar, ele aparece aqui.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Anotar gasto' }).getAttribute('href')).toBe('/anotar')
})

test('busca sem resultado repete o termo', () => {
  render(<ExtratoList view={{ ...base, filters: { ...base.filters, q: 'xyz' }, empty: 'no-results' }} />)
  expect(screen.getByText('Nada encontrado para "xyz". Tente outra palavra ou um valor.')).toBeTruthy()
})

test('filtro sem resultado oferece limpar os filtros do mês', () => {
  render(<ExtratoList view={{ ...base, filters: { ...base.filters, kind: 'expense', categoryId: '11111111-1111-4111-8111-111111111111' }, empty: 'no-matches' }} />)
  expect(screen.getByText('Nenhum registro com esses filtros.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Limpar filtros' }).getAttribute('href')).toBe('/extrato?mes=2026-09')
})

test('sem entradas no mês com filtro Entradas: convite específico para registrar entrada (fix round 1)', () => {
  render(<ExtratoList view={{ ...base, filters: { ...base.filters, kind: 'income' }, empty: 'no-matches' }} />)
  expect(screen.getByText('Nenhuma entrada este mês ainda. Registrar o que entrou ajuda a ver quanto está disponível.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Registrar entrada' }).getAttribute('href')).toBe('/anotar?tipo=entrada')
  expect(screen.queryByText('Nenhum registro com esses filtros.')).toBeNull()
})

test('parcela: selo do protótipo e link para a compra', () => {
  render(
    <ExtratoList
      view={{
        ...base,
        groups: [{ date: '2026-09-22', label: 'Hoje', rows: [{ id: 't9', kind: 'expense', title: 'Compras · tênis', subtitle: 'Nubank pessoal', cents: 8450, href: '/extrato/parcelas/p1', badge: 'parcela 2 de 5' }] }],
      }}
    />,
  )
  const link = screen.getByRole('link', { name: /Compras · tênis/ })
  expect(link.getAttribute('href')).toBe('/extrato/parcelas/p1')
  expect(link.textContent).toContain('Nubank pessoal')
  expect(link.textContent).toContain('parcela 2 de 5')
})
