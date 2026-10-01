// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('@/features/contas/actions', () => ({ markBillPaid: vi.fn() }))
vi.mock('./money-actions', () => ({ payFamilyBill: vi.fn() }))
const { FamilyMonth } = await import('./family-month')

afterEach(() => cleanup())

const NBSP = String.fromCharCode(0xa0)
const base = {
  label: 'setembro de 2026', isCurrentMonth: true, totalCents: 80230,
  byMember: [{ label: 'Você', initial: 'C', cents: 8990 }, { label: 'Alex', initial: 'A', cents: 71240 }],
  categories: [{ label: 'Mercado', cents: 71240, percent: 88 }, { label: 'Casa', cents: 8990, percent: 11 }],
  bills: [], goals: [],
  recent: [
    { id: 'a', title: 'Mercado', caption: 'Hoje · por Alex', amountCents: 31240, href: null },
    { id: 'b', title: 'Casa', caption: 'Ontem · por você', amountCents: 8990, href: '/extrato/b' },
  ],
  empty: false,
}

test('cartão do total, pessoas e rodapé sempre presentes', () => {
  render(<FamilyMonth view={base} />)
  const heading = screen.getByRole('heading', { name: 'Gastos da família em setembro' })
  const card = heading.closest('section') as HTMLElement
  expect(card.textContent).toContain(`R$${NBSP}802,30`)
  expect(within(card).getByText('Aqui aparecem só os gastos marcados como da família.')).toBeTruthy()
  expect(within(card).getByText('Alex')).toBeTruthy()
  expect(screen.getByText('O Disponível e as entradas de cada pessoa nunca aparecem aqui.')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Para onde vai o dinheiro da casa' })).toBeTruthy()
})

test('gasto sem href não é link; com href vai para o Extrato', () => {
  render(<FamilyMonth view={base} />)
  expect(screen.queryByRole('link', { name: /Mercado/ })).toBeNull()
  expect(screen.getByRole('link', { name: /Casa/ }).getAttribute('href')).toBe('/extrato/b')
})

test('vazio: texto da copy, Anotar gasto e o rodapé', () => {
  render(<FamilyMonth view={{ ...base, totalCents: 0, byMember: [], categories: [], recent: [], empty: true }} />)
  expect(screen.getByText('Nenhum gasto da família neste mês. Quando alguém marcar um gasto como da família, ele aparece aqui.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Anotar gasto' }).getAttribute('href')).toBe('/anotar')
  expect(screen.queryByRole('heading', { name: /Gastos da família em/ })).toBeNull()
  expect(screen.getByText('O Disponível e as entradas de cada pessoa nunca aparecem aqui.')).toBeTruthy()
})

test('contas da família: pagar pede confirmação e leva id e volta', () => {
  render(<FamilyMonth view={{ ...base, bills: [{ id: 'b1', name: 'Luz', amountCents: 20000, due: 'vence amanhã' }, { id: 'b2', name: 'Água', amountCents: 9000, due: 'vence hoje' }] }} />)
  expect(screen.getByRole('link', { name: 'Ver todas' }).getAttribute('href')).toBe('/familia/contas')
  fireEvent.click(screen.getByRole('button', { name: 'Marcar Luz como paga' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Marcar Luz como paga?' })
  const hidden = Object.fromEntries(Array.from(dialog.querySelectorAll('input[type="hidden"]')).map((i) => [(i as HTMLInputElement).name, (i as HTMLInputElement).value]))
  expect(hidden).toEqual({ id: 'b1', volta: '/inicio/familia' })
  expect(screen.getByRole('button', { name: 'Marcar Água como paga' })).toBeTruthy()
})

test('metas da família: o que falta, o guardado e só a sua parte', () => {
  const goals = [
    { id: 'g1', name: 'Reforma', percent: 30, remainingCents: 700000, savedCents: 300000, targetCents: 1000000, myPartCents: 180000 },
    { id: 'g2', name: 'Viagem', percent: 10, remainingCents: 900000, savedCents: 100000, targetCents: 1000000, myPartCents: 0 },
  ]
  const { container } = render(<FamilyMonth view={{ ...base, goals }} />)
  const text = (container.textContent ?? '').replaceAll(NBSP, ' ')
  expect(text).toContain('Faltam R$ 7.000,00 para Reforma.')
  expect(text).toContain('R$ 3.000,00 de R$ 10.000,00')
  expect(text).toContain('Sua parte: R$ 1.800,00')
  expect(screen.getByRole('link', { name: 'Ver metas' }).getAttribute('href')).toBe('/metas')
  expect(screen.getByRole('link', { name: 'Guardar dinheiro em Reforma' }).getAttribute('href')).toBe('/metas/g1/guardar')
  expect(screen.getByRole('link', { name: 'Guardar dinheiro em Viagem' }).getAttribute('href')).toBe('/metas/g2/guardar')
})
