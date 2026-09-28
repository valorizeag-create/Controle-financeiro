// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const acts = vi.hoisted(() => ({ depositToGoal: vi.fn(), withdrawFromGoal: vi.fn() }))
vi.mock('./movement-actions', () => acts)
const { MoveForm } = await import('./move-form')

const mockUseActionState = vi.mocked(useActionState)

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('guardar: valor, aviso de que sai do Disponível e "Guardar dinheiro"', () => {
  render(<MoveForm goalId="g1" mode="deposit" />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(acts.depositToGoal)
  expect((screen.getByLabelText('Quanto você quer guardar?') as HTMLInputElement).inputMode).toBe('decimal')
  expect(screen.getByText('Esse valor sai do seu Disponível deste mês.')).toBeTruthy()
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('g1')
  expect(screen.getByRole('button', { name: 'Guardar dinheiro' })).toBeTruthy()
})

test('tirar: erro de valor maior que o guardado fica no campo, com o valor digitado (Review Focus 4)', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, fieldErrors: { amount: 'Esta meta tem R$ 180,00. Tire até esse valor.' }, values: { amount: '500' } },
    vi.fn(),
    false,
  ])
  render(<MoveForm goalId="g1" mode="withdraw" />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(acts.withdrawFromGoal)
  const input = screen.getByLabelText('Quanto você quer tirar?') as HTMLInputElement
  expect(input.value).toBe('500')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(screen.getByText('Esta meta tem R$ 180,00. Tire até esse valor.')).toBeTruthy()
  expect(screen.getByText('Esse valor volta para o seu Disponível deste mês.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Tirar dinheiro' })).toBeTruthy()
})
