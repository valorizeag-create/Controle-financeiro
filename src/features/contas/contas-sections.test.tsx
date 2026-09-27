// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('./actions', () => ({ markBillPaid: vi.fn() }))
const { BillsList, ContasTabs, IncomeList, RecurringList, contasHref } = await import('./contas-sections')

afterEach(() => cleanup())

const luz = { id: 'luz', name: 'Luz', amountCents: 18000, caption: 'R$ 180,00 · vence dia 25 · em 3 dias' }

test('abas com contagem, link e aba atual', () => {
  render(<ContasTabs month="2026-09" tab="vencidas" counts={{ 'a-pagar': 3, pagas: 4, vencidas: 0 }} />)
  const nav = screen.getByRole('navigation', { name: 'Situação das contas' })
  expect(within(nav).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
    ['A pagar · 3', '/contas?mes=2026-09'],
    ['Pagas · 4', '/contas?mes=2026-09&aba=pagas'],
    ['Vencidas · 0', '/contas?mes=2026-09&aba=vencidas'],
  ])
  expect(screen.getByRole('link', { name: 'Vencidas · 0' }).getAttribute('aria-current')).toBe('page')
  expect(contasHref('2026-09', 'a-pagar')).toBe('/contas?mes=2026-09')
})

test('a pagar: "Paga" abre a confirmação da copy, com id e volta', () => {
  render(<BillsList tab="a-pagar" bills={[luz]} back="/contas?mes=2026-09" />)
  expect(screen.getByText(luz.caption)).toBeTruthy()
  const pay = screen.getByRole('button', { name: 'Marcar Luz como paga' })
  expect(pay.textContent).toBe('Paga')
  fireEvent.click(pay)
  const dialog = screen.getByRole('alertdialog', { name: 'Marcar Luz como paga?' })
  expect(within(dialog).getByRole('button', { name: 'Marcar como paga' }).getAttribute('type')).toBe('submit')
  expect(within(dialog).getByRole('button', { name: 'Agora não' })).toBeTruthy()
  const hidden = Object.fromEntries(Array.from(dialog.querySelectorAll('input[type="hidden"]')).map((i) => [(i as HTMLInputElement).name, (i as HTMLInputElement).value]))
  expect(hidden).toEqual({ id: 'luz', volta: '/contas?mes=2026-09' })
})

test('vencida aparece calma: sem vermelho e sem "atrasada"', () => {
  const agua = { id: 'agua', name: 'Água', amountCents: 9000, caption: 'R$ 90,00 · venceu em 10 de setembro' }
  const { container } = render(<BillsList tab="vencidas" bills={[agua]} back="/contas" />)
  expect(container.innerHTML).not.toMatch(/red|error|atrasad/i)
  expect(screen.getByRole('button', { name: 'Marcar Água como paga' })).toBeTruthy()
})

test('pagas não têm botão; listas vazias têm texto próprio', () => {
  const { rerender } = render(<BillsList tab="pagas" bills={[{ ...luz, caption: 'R$ 180,00 · paga em 25 de setembro' }]} back="/contas" />)
  expect(screen.queryByRole('button')).toBeNull()
  rerender(<BillsList tab="a-pagar" bills={[]} back="/contas" />)
  expect(screen.getByText('Nenhuma conta a pagar neste mês.')).toBeTruthy()
  rerender(<BillsList tab="pagas" bills={[]} back="/contas" />)
  expect(screen.getByText('Nenhuma conta paga neste mês.')).toBeTruthy()
  rerender(<BillsList tab="vencidas" bills={[]} back="/contas" />)
  expect(screen.getByText('Nenhuma conta vencida.')).toBeTruthy()
})

test('entradas a receber levam ao painel "Recebi"', () => {
  render(<IncomeList items={[{ id: 'fre', name: 'Freela mensal', amountCents: 80000, caption: 'R$ 800,00 · previsto para dia 30' }]} />)
  const region = screen.getByRole('region', { name: 'Entradas a receber' })
  const link = within(region).getByRole('link', { name: 'Recebi Freela mensal' })
  expect(link.textContent).toBe('Recebi')
  expect(link.getAttribute('href')).toBe('/contas/receber/fre')
})

test('contas que se repetem abrem a edição; vazia mostra o texto', () => {
  const { rerender } = render(
    <RecurringList title="Contas que se repetem" empty="Nenhuma conta que se repete ainda." items={[{ id: 'r1', name: 'Luz', caption: 'Todo mês · dia 25', amountCents: 18000 }]} />,
  )
  const link = within(screen.getByRole('region', { name: 'Contas que se repetem' })).getByRole('link', { name: /Luz/ })
  expect(link.getAttribute('href')).toBe('/contas/recorrencia/r1')
  expect(link.textContent).toContain('Todo mês · dia 25')
  rerender(<RecurringList title="Contas que se repetem" empty="Nenhuma conta que se repete ainda." items={[]} />)
  expect(screen.getByText('Nenhuma conta que se repete ainda.')).toBeTruthy()
})
