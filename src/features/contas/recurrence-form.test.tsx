// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useActionState } from 'react'

vi.mock('react', async (orig) => {
  const react = await orig<typeof import('react')>()
  return { ...react, useActionState: vi.fn(() => [{ status: 'idle' }, vi.fn(), false]) }
})
const { RecurrenceForm } = await import('./recurrence-form')

const mockUseActionState = vi.mocked(useActionState)
const action = vi.fn()
const categories = [{ id: 'c1', name: 'Casa', defaultKey: 'casa' }, { id: 'c2', name: 'Mercado', defaultKey: 'mercado' }]

afterEach(() => {
  cleanup()
  mockUseActionState.mockClear()
})

test('Nova conta: nome, valor, categoria, frequência, dia; anual pede o mês', () => {
  render(<RecurrenceForm kind="expense" categories={categories} action={action} />)
  expect(mockUseActionState.mock.calls[0][0]).toBe(action)
  expect(screen.getByLabelText('Nome')).toBeTruthy()
  expect(screen.getByLabelText('Valor').getAttribute('inputmode')).toBe('decimal')
  expect(screen.getByRole('radio', { name: 'Casa' })).toBeTruthy()
  expect(screen.getByLabelText('Vence dia').getAttribute('inputmode')).toBe('numeric')
  expect(screen.getByRole('radio', { name: 'Todo mês' })).toHaveProperty('checked', true)
  expect(screen.queryByLabelText('Mês')).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: 'Todo ano' }))
  const month = screen.getByLabelText('Mês') as HTMLSelectElement
  expect(within(month).getAllByRole('option').slice(1).map((o) => o.textContent)).toHaveLength(12)
  expect(within(month).getByRole('option', { name: 'janeiro' }).getAttribute('value')).toBe('1')
  expect(screen.getByRole('button', { name: 'Salvar conta' })).toBeTruthy()
})

test('editar entrada: origem e dia preenchidos, frequência só como texto', () => {
  render(
    <RecurrenceForm
      kind="income"
      categories={categories}
      action={action}
      recurrence={{ id: 'r3', kind: 'income', name: 'Freela', amountCents: 80000, categoryId: null, source: 'Freela', frequency: 'monthly', dueDay: 30, dueMonth: null, startsOn: '2026-09-30', endedOn: null }}
    />,
  )
  expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Freela')
  expect((screen.getByLabelText('Valor') as HTMLInputElement).value).toBe('800,00')
  expect(screen.getByRole('radio', { name: 'Freela' })).toHaveProperty('checked', true)
  expect((screen.getByLabelText('Chega dia') as HTMLInputElement).value).toBe('30')
  expect(screen.queryByRole('radio', { name: 'Todo ano' })).toBeNull()
  expect(screen.getByText('Todo mês')).toBeTruthy()
  expect((document.querySelector('input[type="hidden"][name="id"]') as HTMLInputElement).value).toBe('r3')
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy()
})

test('erros aparecem nos campos e o que foi digitado continua', () => {
  mockUseActionState.mockReturnValueOnce([
    {
      status: 'error', submission: 1,
      fieldErrors: { name: 'Falta o nome.', dueMonth: 'Escolha o mês.' },
      values: { name: '', amount: '180', categoryId: 'c2', frequency: 'yearly', dueDay: '10', dueMonth: '' },
    },
    vi.fn(),
    false,
  ])
  render(<RecurrenceForm kind="expense" categories={categories} action={action} />)
  expect(screen.getByText('Falta o nome.')).toBeTruthy()
  expect(screen.getByText('Escolha o mês.')).toBeTruthy()
  expect((screen.getByLabelText('Valor') as HTMLInputElement).value).toBe('180')
  expect(screen.getByRole('radio', { name: 'Mercado' })).toHaveProperty('checked', true)
  expect(screen.getByRole('radio', { name: 'Todo ano' })).toHaveProperty('checked', true)
})

test('"Conta da família" só com inFamily, só em conta e só ao criar', () => {
  render(<RecurrenceForm kind="expense" categories={categories} action={action} />)
  expect(screen.queryByLabelText('Conta da família')).toBeNull()
  cleanup()
  render(<RecurrenceForm kind="expense" categories={categories} action={action} inFamily />)
  const box = screen.getByLabelText('Conta da família') as HTMLInputElement
  expect(box.name).toBe('family')
  expect(box.checked).toBe(false)
  cleanup()
  render(<RecurrenceForm kind="income" categories={categories} action={action} inFamily />)
  expect(screen.queryByLabelText('Conta da família')).toBeNull()
})

test('depois de um erro, "Conta da família" continua marcada', () => {
  mockUseActionState.mockReturnValueOnce([
    { status: 'error', submission: 1, fieldErrors: { name: 'Falta o nome.' }, values: { name: '', amount: '10', family: 'on' } },
    vi.fn(),
    false,
  ])
  render(<RecurrenceForm kind="expense" categories={categories} action={action} inFamily />)
  expect(screen.getByLabelText('Conta da família')).toHaveProperty('checked', true)
})
