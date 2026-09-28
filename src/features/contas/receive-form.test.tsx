// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('./actions', () => ({ confirmIncome: vi.fn() }))
vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { ReceiveForm } = await import('./receive-form')
const { confirmIncome } = await import('./actions')
const mockUseActionState = vi.mocked(useActionState)

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('vem com o valor previsto para a pessoa ajustar', () => {
  render(<ReceiveForm id="fre" amountCents={80000} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(confirmIncome)
  expect((screen.getByLabelText('Quanto entrou?') as HTMLInputElement).value).toBe('800,00')
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('fre')
  expect(screen.getByRole('button', { name: 'Confirmar entrada' })).toHaveProperty('disabled', false)
})

test('erro mostra a mensagem e mantém o valor digitado; botão trava enquanto salva', () => {
  mockUseActionState.mockReturnValueOnce([{ status: 'error', submission: 1, fieldErrors: { amount: 'Falta o valor.' }, values: { amount: '' } }, vi.fn(), false])
  const { rerender } = render(<ReceiveForm id="fre" amountCents={80000} />)
  expect(screen.getByText('Falta o valor.')).toBeTruthy()
  expect((screen.getByLabelText('Quanto entrou?') as HTMLInputElement).value).toBe('')
  mockUseActionState.mockReturnValueOnce([{ status: 'idle' }, vi.fn(), true])
  rerender(<ReceiveForm id="fre" amountCents={80000} />)
  expect(screen.getByRole('button', { name: 'Confirmar entrada' })).toHaveProperty('disabled', true)
})
