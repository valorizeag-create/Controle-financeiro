// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { PlanForm } = await import('./plan-form')

const mockUseActionState = vi.mocked(useActionState)
const action = vi.fn()
const view = {
  month: '2026-09',
  monthText: 'Setembro de 2026',
  fields: [
    { categoryId: 'c1', name: 'Mercado', value: '1000,00', autoFocus: false },
    { categoryId: 'c4', name: 'Comer fora', value: '400,00', autoFocus: true },
    { categoryId: 'c7', name: 'Outros', value: '', autoFocus: false },
  ],
}

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('um campo por categoria, com o planejado atual, o mês escondido e o foco na categoria a ajustar', () => {
  render(<PlanForm view={view} action={action} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(action)
  const mercado = screen.getByLabelText('Mercado') as HTMLInputElement
  expect([mercado.name, mercado.value, mercado.inputMode]).toEqual(['plan.c1', '1000,00', 'decimal'])
  expect((screen.getByLabelText('Outros') as HTMLInputElement).value).toBe('')
  expect(document.activeElement).toBe(screen.getByLabelText('Comer fora'))
  expect((document.querySelector('input[type="hidden"][name="month"]') as HTMLInputElement).value).toBe('2026-09')
  expect(screen.getByRole('button', { name: 'Salvar planejamento' })).toBeTruthy()
})

test('erro sob o campo e o que foi digitado fica (Review Focus 4)', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, fieldErrors: { 'plan.c1': 'Esse valor não parece certo. Use apenas números.' }, values: { 'plan.c1': 'abc', 'plan.c4': '500', 'plan.c7': '' } },
    vi.fn(),
    false,
  ])
  render(<PlanForm view={view} action={action} />)
  const mercado = screen.getByLabelText('Mercado') as HTMLInputElement
  expect(mercado.value).toBe('abc')
  expect(mercado.getAttribute('aria-invalid')).toBe('true')
  expect(document.getElementById(mercado.getAttribute('aria-describedby')!)?.textContent).toBe('Esse valor não parece certo. Use apenas números.')
  expect((screen.getByLabelText('Comer fora') as HTMLInputElement).value).toBe('500')
})
