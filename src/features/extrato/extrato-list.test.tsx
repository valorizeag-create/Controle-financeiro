// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ExtratoList } from './extrato-list'
import type { ExtratoView } from './view-model'

afterEach(() => cleanup())

// formatBRL separa "R$" do número com espaço não separável.
const NBSP = String.fromCharCode(0xa0)

const base: ExtratoView = {
  filters: { month: '2026-09', kind: null, categoryId: null, q: '' },
  monthLabel: 'setembro de 2026',
  groups: [],
  empty: null,
  categoryName: null,
}

test('lista agrupada por dia; cada registro abre a edição', () => {
  render(
    <ExtratoList
      view={{
        ...base,
        groups: [
          { date: '2026-09-22', label: 'Hoje', rows: [{ id: 't1', kind: 'expense', title: 'Mercado · feira', subtitle: 'Pix', cents: 14230 }] },
          { date: '2026-09-05', label: '5 de setembro', rows: [{ id: 't4', kind: 'income', title: 'Salário', subtitle: null, cents: 500000 }] },
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
  render(<ExtratoList view={{ ...base, filters: { ...base.filters, kind: 'income' }, empty: 'no-matches' }} />)
  expect(screen.getByText('Nenhum registro com esses filtros.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Limpar filtros' }).getAttribute('href')).toBe('/extrato?mes=2026-09')
})
