// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('./actions', () => ({ settlePurchase: vi.fn() }))
vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { SettleForm } = await import('./settle-form')
const { settlePurchase } = await import('./actions')
const mockUseActionState = vi.mocked(useActionState)

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('vem com o que falta para a pessoa ajustar', () => {
  render(<SettleForm id="p1" amountCents={20000} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(settlePurchase)
  expect((screen.getByLabelText('Quanto foi?') as HTMLInputElement).value).toBe('200,00')
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('p1')
  expect(screen.getByRole('button', { name: 'Quitar parcelas' })).toHaveProperty('disabled', false)
})

test('erro mantém o valor digitado; botão trava enquanto salva (toque duplo)', () => {
  mockUseActionState.mockReturnValueOnce([{ status: 'error', submission: 1, fieldErrors: { amount: 'Falta o valor.' }, values: { amount: '' } }, vi.fn(), false])
  const { rerender } = render(<SettleForm id="p1" amountCents={20000} />)
  expect(screen.getByText('Falta o valor.')).toBeTruthy()
  expect((screen.getByLabelText('Quanto foi?') as HTMLInputElement).value).toBe('')
  mockUseActionState.mockReturnValueOnce([{ status: 'idle' }, vi.fn(), true])
  rerender(<SettleForm id="p1" amountCents={20000} />)
  expect(screen.getByRole('button', { name: 'Quitar parcelas' })).toHaveProperty('disabled', true)
})
