// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
vi.mock('./money-actions', () => ({ updateFamilyExpense: vi.fn(), deleteFamilyExpense: vi.fn(), updateFamilyBill: vi.fn() }))
const { FamilyExpenseForm } = await import('./family-expense-form')
const { FamilyBillForm } = await import('./family-bill-form')
const { updateFamilyExpense, updateFamilyBill } = await import('./money-actions')

const mockUseActionState = vi.mocked(useActionState)

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

const expense = { id: 'e1', amountCents: 31240, effectiveOn: '2026-09-27', note: 'Feira' }

test('gasto: ação do administrador, quem registrou, campos da copy e id escondido', () => {
  const { container } = render(<FamilyExpenseForm expense={expense} author="Alex" today="2026-09-28" />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(updateFamilyExpense)
  expect(screen.getByText('Registrado por Alex')).toBeTruthy()
  expect((screen.getByLabelText('Quanto foi?') as HTMLInputElement).value).toBe('312,40')
  expect((screen.getByLabelText('Ontem') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('Uma nota, se quiser') as HTMLInputElement).value).toBe('Feira')
  expect((container.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('e1')
  expect(screen.getByRole('button', { name: 'Salvar gasto' })).toBeTruthy()
  for (const t of ['Hoje', 'Ontem', 'Outro dia']) expect(screen.getByLabelText(t)).toBeTruthy()
})

test('gasto: Excluir pede confirmação com o texto aprovado', () => {
  render(<FamilyExpenseForm expense={expense} author="Alex" today="2026-09-28" />)
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Excluir este gasto?' })
  expect(within(dialog).getByText('O mês de quem registrou será recalculado.')).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Excluir' })).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeTruthy()
})

test('gasto: "Escolha o dia." volta no campo da data e o digitado fica', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, fieldErrors: { date: 'Escolha o dia.' }, values: { amount: '10,00', when: 'other', date: '2099-01-01', note: '' } },
    vi.fn(),
    false,
  ])
  render(<FamilyExpenseForm expense={expense} author="Alex" today="2026-09-28" />)
  expect(screen.getByText('Escolha o dia.')).toBeTruthy()
  expect((screen.getByLabelText('Dia') as HTMLInputElement).value).toBe('2099-01-01')
  expect((screen.getByLabelText('Quanto foi?') as HTMLInputElement).value).toBe('10,00')
})

test('conta: ação da família, campos preenchidos e "Salvar conta"', () => {
  const { container } = render(<FamilyBillForm bill={{ id: 'r1', name: 'Aluguel', amountCents: 180000, dueDay: 5 }} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(updateFamilyBill)
  expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Aluguel')
  expect((screen.getByLabelText('Valor') as HTMLInputElement).value).toBe('1800,00')
  expect((screen.getByLabelText('Vence dia') as HTMLInputElement).value).toBe('5')
  expect((container.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('r1')
  expect(screen.getByRole('button', { name: 'Salvar conta' })).toBeTruthy()
})
