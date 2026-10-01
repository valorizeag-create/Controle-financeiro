// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('@/features/contas/actions', () => ({ markBillPaid: vi.fn() }))
vi.mock('./money-actions', () => ({ payFamilyBill: vi.fn(), endFamilyBill: vi.fn() }))
const { FamilyBills } = await import('./family-bills')

afterEach(() => cleanup())

const view = {
  overdue: [{ id: 'b1', name: 'Luz', amountCents: 20000, due: 'venceu em 20 de setembro', author: 'Alex' }],
  due: [{ id: 'b2', name: 'Água', amountCents: 9000, due: 'vence em 2 dias', author: 'você' }],
  recurring: [
    { id: 'r1', name: 'Aluguel', amountCents: 180000, caption: 'Todo mês · dia 5 · criada por Alex', canManage: false },
    { id: 'r2', name: 'Água', amountCents: 9000, caption: 'Todo mês · dia 30 · criada por você', canManage: true },
  ],
}

test('vencidas e a pagar, cada uma com "Marcar {conta} como paga"', () => {
  render(<FamilyBills view={view} />)
  expect(screen.getByRole('heading', { name: 'Vencidas' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'A pagar' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Marcar Luz como paga' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Marcar Luz como paga?' })
  expect(within(dialog).getByRole('button', { name: 'Marcar como paga' })).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Agora não' })).toBeTruthy()
  const hidden = Object.fromEntries(Array.from(dialog.querySelectorAll('input[type="hidden"]')).map((i) => [(i as HTMLInputElement).name, (i as HTMLInputElement).value]))
  expect(hidden).toEqual({ id: 'b1', volta: '/familia/contas' })
  expect(screen.getByRole('button', { name: 'Marcar Água como paga' })).toBeTruthy()
})

test('Alterar e Encerrar só nas contas que a pessoa pode gerir', () => {
  render(<FamilyBills view={view} />)
  expect(screen.getAllByRole('link', { name: /^Alterar/ }).map((l) => [l.getAttribute('aria-label'), l.getAttribute('href')])).toEqual([['Alterar Água', '/familia/contas/r2']])
  expect(screen.getAllByRole('button', { name: /^Encerrar/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Encerrar Água'])
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar Água' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Encerrar "Água"?' })
  expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeTruthy()
})

test('vazio: texto da copy e nenhuma lista', () => {
  render(<FamilyBills view={{ overdue: [], due: [], recurring: [] }} />)
  expect(screen.getByText('Nenhuma conta da família a pagar.')).toBeTruthy()
  expect(screen.queryByRole('heading')).toBeNull()
})
